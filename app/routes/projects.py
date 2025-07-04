from flask import Blueprint, request, jsonify, current_app, url_for
from flask_login import login_required, current_user
from flask_pymongo import PyMongo
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from app.utils.helpers import logger, safe_object_id, handle_db_error
from app.utils.history import log_history
import os
import uuid
from werkzeug.utils import secure_filename
from flask_socketio import emit

projects_bp = Blueprint('projects', __name__)

def init_projects(app):
    global mongo
    mongo = PyMongo(app)

@projects_bp.route("/projects/reorder", methods=["POST"])
@login_required
def reorder_projects():
    data = request.get_json()
    order = data.get("order", [])
    user_id = safe_object_id(current_user.get_id())

    # 사용자의 project_order 배열을 업데이트
    mongo.db.users.update_one(
        {"_id": user_id},
        {"$set": {"project_order": order}}
    )

    return jsonify({"message": "프로젝트 순서가 사용자별로 업데이트되었습니다."}), 200

@projects_bp.route("/projects/order", methods=["GET"])
@login_required
def get_project_order():
    user_id = safe_object_id(current_user.get_id())

    user = mongo.db.users.find_one({"_id": user_id}, {"project_order": 1})
    project_order = user.get("project_order", []) if user else []

    # 현재 사용자가 속한 프로젝트 리스트
    projects = list(mongo.db.projects.find({"members": user_id}))

    # 프로젝트 ID 집합
    project_ids = set(str(p["_id"]) for p in projects)

    # project_order에 없는 새 프로젝트는 뒤에 추가
    full_order = [pid for pid in project_order if pid in project_ids]
    missing_projects = [str(p["_id"]) for p in projects if str(p["_id"]) not in full_order]
    full_order.extend(missing_projects)

    return jsonify({"order": full_order}), 200

@projects_bp.route("/projects/create", methods=["POST"])
@login_required
def create_project():
    data = request.get_json()
    if not data or "name" not in data:
        logger.error("Missing project name in request")
        return jsonify({"message": "프로젝트 이름이 필요합니다."}), 400

    try:
        deadline_str = data.get("deadline")
        deadline = None
        if deadline_str:
            try:
                deadline = datetime.strptime(deadline_str, "%Y-%m-%d")
            except ValueError:
                logger.warning(f"Invalid deadline format: {deadline_str}")
                return jsonify({"message": "유효하지 않은 마감일 형식입니다."}), 400

        user_id = safe_object_id(current_user.get_id())

        new_project = {
            "name": data["name"],
            "description": data.get("description", ""),
            "deadline": deadline,
            "members": [user_id],
            "owner": user_id,
            "created_at": datetime.utcnow(),
        }

        result = mongo.db.projects.insert_one(new_project)
        project_id = str(result.inserted_id)

        # 프로젝트 생성 후 사용자 정보 업데이트
        mongo.db.users.update_one(
            {"_id": user_id},
            {"$push": {"project_order": str(project_id)}}
        )


        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(user_id),
            nickname= current_user.nickname,
            action="create",
            details={
                "project_name": new_project["name"],
                "nickname": current_user.nickname
            }
        )

        return jsonify({
            "id": project_id, 
            "name": data["name"],
            "description": data.get("description", ""),
            "deadline": new_project["deadline"].strftime('%Y-%m-%d') if new_project["deadline"] else None,
            "members": [user_id],
            "owner": user_id,
            "created_at": new_project["created_at"] }), 201
    except Exception as e:
        return handle_db_error(e)

@projects_bp.route("/projects/<project_id>", methods=["DELETE"])
@login_required
def delete_or_leave_project(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    user_id = safe_object_id(current_user.get_id())
    if project.get("owner") == user_id:
        member_ids = project.get("members", [])  # ObjectId 리스트
        mongo.db.projects.delete_one({"_id": oid})
        mongo.db.cards.delete_many({"project_id": oid})
        mongo.db.comments.delete_many({"project_id": oid})
        mongo.db.users.update_many(
            {"_id": {"$in": member_ids}},
            {"$pull": {"project_order": str(project_id)}}
        )

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(user_id),
            nickname= current_user.nickname,
            action="delete",
            details={
                "project_name": project["name"],
                "nickname": current_user.nickname
            }
        )
        logger.info(f"Deleted project: {project_id}")
        return jsonify({"message": "프로젝트가 삭제되었습니다."}), 200
    elif user_id in project.get("members", []):
        mongo.db.projects.update_one(
            {"_id": oid},
            {"$pull": {"members": user_id}}
        )
        mongo.db.users.update_one(
            {"_id": user_id},
            {"$pull": {"project_order": str(project_id)}}
        )

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(user_id),
            nickname= current_user.nickname,
            action="leave",
            details={
                "project_name": project["name"],
                "nickname": current_user.nickname
            }
        )
        logger.info(f"User {user_id} left project: {project_id}")
        return jsonify({"message": "프로젝트에서 나갔습니다."}), 200

    logger.error(f"User {user_id} has no permission for project: {project_id}")
    return jsonify({"message": "권한이 없습니다."}), 403

@projects_bp.route("/projects/<project_id>", methods=["GET"])
@login_required
def get_project(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": safe_object_id(current_user.get_id())})
    if project:
        logger.info(f"Retrieved project: {project_id}")
        return jsonify({
            "id": str(project["_id"]),
            "name": project["name"],
            "owner_id": str(project["owner"]),
            "description": project.get("description", ""),
            "deadline": project["deadline"].strftime("%Y-%m-%d") if project.get("deadline") else None
        }), 200
    logger.error(f"Project not found or user has no access: {project_id}")
    return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

@projects_bp.route("/projects/<project_id>", methods=["PUT"])
@login_required
def edit_project(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    data = request.get_json() or {}
    update_fields = {}
    if "name" in data:
        update_fields["name"] = data["name"].strip()
    if "description" in data:
        update_fields["description"] = data["description"].strip()
    if "deadline" in data:
        try:
            update_fields["deadline"] = datetime.strptime(data["deadline"], "%Y-%m-%d")
        except ValueError:
            # 잘못된 날짜 포맷은 무시
            pass

    if not update_fields:
        return jsonify({"message": "변경할 내용이 없습니다."}), 400

    old_proj = mongo.db.projects.find_one(
        {"_id": oid}, {"name":1, "description":1}
    )

    # 2) 실제 업데이트
    result = mongo.db.projects.update_one(
        {"_id": oid, "members": safe_object_id(current_user.get_id())},
        {"$set": update_fields}
    )

    # 3) 히스토리 기록
    if result.modified_count:
        details = {}
        # 제목 변경 감지
        if "name" in update_fields and old_proj["name"] != update_fields["name"]:
            details["old_name"] = old_proj["name"]
            details["new_name"] = update_fields["name"]
        # 설명 변경 감지
        if "description" in update_fields and old_proj.get("description","") != update_fields["description"]:
            details["old_description"] = old_proj.get("description","")
            details["new_description"] = update_fields["description"]
        if details:
            # 편의를 위해 post-history에 보일 project_name 넣어줌
            details["project_name"] = update_fields.get("name", old_proj["name"])
            log_history(
                mongo=mongo,
                project_id=project_id,
                card_id=None,
                user_id=str(current_user.get_id()),
                nickname=current_user.nickname,
                action="project_update",
                details=details
            )

    if result.modified_count:
        proj = mongo.db.projects.find_one({"_id": oid})
        emit('project_updated', {
     'project_id': project_id,
     'action': '수정',
     'user_nickname': current_user.nickname,
     'name': proj.get("name", ""),
     'description': proj.get("description", ""),
     'deadline': proj.get("deadline").strftime("%Y-%m-%d") if proj.get("deadline") else None
   }, room=project_id, namespace='/')
        return jsonify({
            "id": str(proj["_id"]),
            "name": proj.get("name", ""),
            "description": proj.get("description", ""),
            "deadline": proj.get("deadline").strftime("%Y-%m-%d") if proj.get("deadline") else None
        }), 200

    return jsonify({"message": "권한이 없거나 변경된 사항이 없습니다."}), 403

@projects_bp.route('/projects/<project_id>/invite', methods=['POST'])
@login_required
def invite_member(project_id):
    data = request.get_json()
    invitee_nickname = data.get('nickname')
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    invitee = mongo.db.users.find_one({"nickname": invitee_nickname})
    if not invitee:
        logger.error(f"User {invitee_nickname} not found")
        return jsonify({"message": "사용자를 찾을 수 없습니다."}), 404

    if safe_object_id(invitee["_id"]) in project.get("members", []):
        logger.error(f"User {invitee_nickname} already a member of project {project_id}")
        return jsonify({"message": "이미 프로젝트 멤버입니다."}), 400

    if oid in invitee.get("invitations", []):
        logger.error(f"User {invitee_nickname} already invited to project {project_id}")
        return jsonify({"message": "이미 초대된 사용자입니다."}), 400

    mongo.db.users.update_one(
        {"_id": invitee["_id"]},
        {"$push": {"invitations": oid}}
    )

    log_history(
        mongo=mongo,
        project_id=project_id,
        card_id=None,
        user_id=str(current_user.get_id()),
        nickname= current_user.nickname,
        action="invite",
        details={
            "inviter_nickname": current_user.nickname,
            "invitee_nickname": invitee_nickname,
            "project_name": project["name"]
        }
    )

    logger.info(f"Sent invitation to {invitee_nickname} for project {project_id}")
    return jsonify({"message": "초대가 전송되었습니다."}), 200

@projects_bp.route('/invitations', methods=['GET'])
@login_required
def get_invitations():
    user_id = safe_object_id(current_user.get_id())
    user_data = mongo.db.users.find_one({"_id": user_id})
    invitations = list(mongo.db.projects.find({"_id": {"$in": user_data.get("invitations", [])}}))
    logger.info(f"Retrieved {len(invitations)} invitations for user {user_id}")
    return jsonify({
        "invitations": [{"id": str(p["_id"]), "name": p["name"]} for p in invitations]
    }), 200

@projects_bp.route('/invitations/respond', methods=['POST'])
@login_required
def respond_invitation():
    data = request.get_json()
    project_id = safe_object_id(data.get("project_id"))
    if not project_id:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    action = data.get("action")
    project = mongo.db.projects.find_one({"_id": project_id})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    user_id = safe_object_id(current_user.get_id())
    mongo.db.users.update_one(
        {"_id": user_id},
        {"$pull": {"invitations": project_id}}
    )

    if action == "accept":
        mongo.db.projects.update_one(
            {"_id": project_id},
            {"$addToSet": {"members": user_id}}
        )

        log_history(
            mongo=mongo,
            project_id=str(project_id),
            card_id=None,
            user_id=str(user_id),
            nickname= current_user.nickname,
            action="join",
            details={
                "project_name": project["name"],
                "nickname": current_user.nickname
            }
        )
        logger.info(f"User {user_id} accepted invitation for project {project_id}")
    else:
        logger.info(f"User {user_id} declined invitation for project {project_id}")

    return jsonify({"message": f"{action} 처리 완료"}), 200

from datetime import datetime, timedelta
from flask import jsonify, request
from bson import ObjectId
from flask_login import login_required, current_user
import logging

logger = logging.getLogger(__name__)

def safe_object_id(id_str):
    try:
        return ObjectId(id_str)
    except:
        return None

@projects_bp.route("/projects/search", methods=["GET"])
@login_required
def search_projects_and_cards():
    try:
        keyword = request.args.get("keyword", "").strip()
        due_date = request.args.get("due_date", "").strip()

        # 입력 유효성 검사
        if not keyword and not due_date:
            return jsonify({"projects": [], "cards": [], "message": "키워드 또는 마감일을 입력하세요."}), 200

        user_id = safe_object_id(current_user.get_id())
        project_query = {"members": user_id}

        # 키워드 검색 조건
        if keyword:
            project_query["$or"] = [
                {"name": {"$regex": keyword, "$options": "i"}},
                {"description": {"$regex": keyword, "$options": "i"}}
            ]

        # 마감일 검색 조건
        if due_date:
            try:
                # due_date는 YYYY-MM-DD 형식으로 입력됨
                due_date_obj = datetime.strptime(due_date, "%Y-%m-%d")
                # due_date의 자정(23:59:59.999+00:00)까지 포함
                due_date_end = due_date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
                project_query["deadline"] = {"$lte": due_date_end}
                logger.debug(f"마감일 쿼리: {project_query['deadline']}")
            except ValueError:
                logger.error(f"잘못된 날짜 형식: {due_date}")
                return jsonify({"projects": [], "cards": [], "message": "잘못된 날짜 형식입니다."}), 400

        # 프로젝트 검색 및 마감일 기준 오름차순 정렬
        projects = mongo.db.projects.find(project_query).sort("deadline", 1)
        project_results = []
        for project in projects:
            # deadline이 datetime 객체이므로 YYYY-MM-DD 형식으로 변환
            deadline = project.get("deadline")
            deadline_str = deadline.strftime("%Y-%m-%d") if isinstance(deadline, datetime) else ""
            project_results.append({
                "id": str(project["_id"]),
                "name": project["name"],
                "description": project.get("description", ""),
                "due_date": deadline_str,
                "type": "project"
            })
        logger.debug(f"프로젝트 검색 결과: {len(project_results)}개, 조건: {project_query}")

        # 카드 검색 (키워드만 적용)
        card_results = []
        if keyword:
            card_query = {
                "$or": [
                    {"title": {"$regex": keyword, "$options": "i"}},
                    {"description": {"$regex": keyword, "$options": "i"}}
                ]
            }
            cards = mongo.db.cards.find(card_query)
            for card in cards:
                project = mongo.db.projects.find_one({
                    "_id": card["project_id"],
                    "members": user_id
                })
                if project:
                    card_results.append({
                        "id": str(card["_id"]),
                        "project_id": str(card["project_id"]),
                        "project_name": project["name"],
                        "title": card["title"],
                        "description": card.get("description", ""),
                        "type": "card"
                    })

        logger.info(f"Search executed: keyword={keyword}, due_date={due_date}, projects={len(project_results)}, cards={len(card_results)}")
        return jsonify({
            "projects": project_results,
            "cards": card_results,
            "message": "검색 완료"
        }), 200
    except Exception as e:
        logger.error(f"Unexpected search error: {str(e)}")
        return handle_db_error(e)

@projects_bp.route("/history/<project_id>", methods=["GET"])
@login_required
def get_history(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404
    
    history = list(mongo.db.history.find({"project_id": oid}).sort("created_at", -1))
    return jsonify({
        "history": [{
            "id": str(h["_id"]),
            "action": h["action"],
            "details": h["details"],
            "user_id": h["user_id"],
            "nickname": h["nickname"],
            "created_at": h["created_at"].replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M:%S")
        } for h in history]
    }), 200

@projects_bp.route("/projects/<project_id>/comments", methods=["GET"])
@login_required
def get_comments(project_id):
    try:
        oid = safe_object_id(project_id)
    except:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    comments = list(mongo.db.comments.find({"project_id": oid}).sort("created_at", 1))
    result = []
    for c in comments:
        item = {
            "_id": str(c["_id"]),
            "author_id": str(c["author_id"]),
            "author_name": c["author_name"],
            "content": c["content"],
            "created_at": c["created_at"].strftime("%Y-%m-%d %H:%M:%S")
        }
        if c.get("image_filename"):
            item["image_url"] = url_for('static', filename=f"uploads/{c['image_filename']}")
        result.append(item)
    return jsonify({"comments": result}), 200

@projects_bp.route("/projects/<project_id>/comments", methods=["POST"])
@login_required
def add_comment(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    content = request.form.get("content", "").strip()
    file = request.files.get("image")

    if not content and not file:
        return jsonify({"message": "댓글 또는 이미지를 입력하세요."}), 400

    user_id = safe_object_id(current_user.get_id())
    upload_dir = os.path.join(current_app.static_folder, "Uploads")
    os.makedirs(upload_dir, exist_ok=True)

    image_filename = None
    image_url = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1]
        image_filename = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(upload_dir, image_filename)
        file.save(save_path)
        image_url = f"/static/Uploads/{image_filename}"
        logger.info(f"Saved comment image as: {image_filename}")

    new_comment = {
        "project_id": oid,
        "author_id": user_id,
        "author_name": current_user.nickname,
        "content": content,
        "created_at": datetime.utcnow()
    }
    if image_filename:
        new_comment["image_filename"] = image_filename

    result = mongo.db.comments.insert_one(new_comment)
    comment_id = str(result.inserted_id)

    log_history(
        mongo=mongo,
        project_id=project_id,
        card_id=None,
        user_id=str(user_id),
        nickname= current_user.nickname,
        action="comment_create",
        details={
            "content": content,
            "project_name": project["name"],
            "image_added": bool(image_filename)
        }
    )

    return jsonify({
        "message": "댓글이 추가되었습니다.",
        "id": comment_id,
        "image_url": image_url
    }), 201

@projects_bp.route("/comments/<comment_id>", methods=["PUT"])
@login_required
def edit_comment(comment_id):
    logger.info(f"Attempting to edit comment: {comment_id}")
    
    try:
        oid = safe_object_id(comment_id)
    except Exception as e:
        logger.error(f"Invalid comment ID format: {comment_id}, error: {str(e)}")
        return jsonify({"message": "유효하지 않은 댓글 ID입니다."}), 400

    comment = mongo.db.comments.find_one({"_id": oid})
    if not comment:
        logger.error(f"Comment not found: {comment_id}")
        return jsonify({"message": "댓글을 찾을 수 없습니다."}), 404

    project = mongo.db.projects.find_one({"_id": comment["project_id"], "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access for comment: {comment_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    if str(comment["author_id"]) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} has no permission to edit comment: {comment_id}")
        return jsonify({"message": "댓글 수정 권한이 없습니다."}), 403

    content = None
    delete_image = False
    new_file = None
    image_url = None
    if request.content_type.startswith("application/json"):
        data = request.get_json()
        content = data.get("content", "").strip()
        delete_image = data.get("delete_image", False)
    else:
        content = request.form.get("content", "").strip()
        delete_image = request.form.get("delete_image") == '1'
        new_file = request.files.get("image")

    if not content and not delete_image and not (new_file and new_file.filename):
        return jsonify({"message": "댓글 내용이 필요합니다."}), 400

    try:
        upload_dir = os.path.join(current_app.static_folder, "Uploads")
        if delete_image and comment.get("image_filename"):
            old_path = os.path.join(upload_dir, comment["image_filename"])
            if os.path.exists(old_path):
                os.remove(old_path)
            mongo.db.comments.update_one(
                {"_id": oid},
                {"$unset": {"image_filename": ""}}
            )

        if new_file and new_file.filename:
            if comment.get("image_filename"):
                old_path = os.path.join(upload_dir, comment["image_filename"])
                if os.path.exists(old_path):
                    os.remove(old_path)
            ext = os.path.splitext(new_file.filename)[1]
            image_filename = f"{uuid.uuid4().hex}{ext}"
            new_file.save(os.path.join(upload_dir, image_filename))
            mongo.db.comments.update_one(
                {"_id": oid},
                {"$set": {"image_filename": image_filename}}
            )
            image_url = f"/static/Uploads/{image_filename}"

        mongo.db.comments.update_one(
            {"_id": oid},
            {"$set": {"content": content}}
        )

        log_history(
            mongo=mongo,
            project_id=str(comment["project_id"]),
            card_id=None,
            user_id=str(current_user.get_id()),
            nickname=current_user.nickname,
            action="comment_update",
            details={
                "old_content": comment["content"],
                "new_content": content,
                "project_name": project["name"],
                "image_updated": bool(new_file and new_file.filename),
                "image_deleted": delete_image
            }
        )

        logger.info(f"Successfully updated comment: {comment_id}, image_url={image_url}, delete_image={delete_image}")
        return jsonify({
            "message": "댓글이 수정되었습니다.",
            "image_url": image_url
        }), 200
    except Exception as e:
        logger.error(f"Error updating comment {comment_id}: {str(e)}")
        return jsonify({"message": "댓글 수정 중 오류가 발생했습니다."}), 500

@projects_bp.route("/comments/<comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    logger.info(f"Attempting to delete comment: {comment_id}")
    
    try:
        oid = safe_object_id(comment_id)
    except Exception as e:
        logger.error(f"Invalid comment ID format: {comment_id}, error: {str(e)}")
        return jsonify({"message": "유효하지 않은 댓글 ID입니다."}), 400

    comment = mongo.db.comments.find_one({"_id": oid})
    if not comment:
        logger.error(f"Comment not found: {comment_id}")
        return jsonify({"message": "댓글을 찾을 수 없습니다."}), 404

    project = mongo.db.projects.find_one({"_id": comment["project_id"], "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access for comment: {comment_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    if str(comment["author_id"]) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} has no permission to delete comment: {comment_id}")
        return jsonify({"message": "댓글 삭제 권한이 없습니다."}), 403

    try:
        if comment.get("image_filename"):
            file_path = os.path.join(current_app.static_folder, "Uploads", comment["image_filename"])
            if os.path.exists(file_path):
                os.remove(file_path)

        mongo.db.comments.delete_one({"_id": oid})

        log_history(
            mongo=mongo,
            project_id=str(comment["project_id"]),
            card_id=None,
            user_id=str(current_user.get_id()),
            nickname= current_user.nickname,
            action="comment_delete",
            details={
                "content": comment["content"],
                "project_name": project["name"]
            }
        )

        logger.info(f"Successfully deleted comment: {comment_id}")
        return jsonify({"message": "댓글이 삭제되었습니다."}), 200
    except Exception as e:
        logger.error(f"Error deleting comment {comment_id}: {str(e)}")
        return jsonify({"message": "댓글 삭제 중 오류가 발생했습니다."}), 500

@projects_bp.route('/projects/<project_id>/deadline', methods=['PUT'])
@login_required
def update_deadline(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": safe_object_id(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    data = request.get_json()
    new_deadline = data.get('deadline')

    # 마감일이 없으면 deadline 필드 제거하거나 null로 업데이트
    if not new_deadline:
        old_deadline_str = project.get('deadline').strftime("%Y-%m-%d") if project.get('deadline') else None

        mongo.db.projects.update_one(
            {"_id": oid},
            {"$unset": {"deadline": ""}}  # deadline 필드 삭제
        )

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(current_user.get_id()),
            nickname=current_user.nickname,
            action="update_deadline",
            details={
                "old_deadline": old_deadline_str,
                "new_deadline": None,
                "project_name": project["name"]
            }
        )

        return jsonify({"message": "마감일이 삭제되었습니다.", "deadline": None}), 200

    # 마감일이 있으면 날짜 형식 검증
    try:
        deadline_dt = datetime.strptime(new_deadline, '%Y-%m-%d')
    except ValueError:
        logger.error(f"Invalid date format: {new_deadline}")
        return jsonify({"message": "유효하지 않은 날짜 형식입니다."}), 400

    old_deadline_str = project.get('deadline').strftime("%Y-%m-%d") if project.get('deadline') else None

    mongo.db.projects.update_one(
        {"_id": oid},
        {"$set": {"deadline": deadline_dt}}
    )

    log_history(
        mongo=mongo,
        project_id=project_id,
        card_id=None,
        user_id=str(current_user.get_id()),
        nickname=current_user.nickname,
        action="update_deadline",
        details={
            "old_deadline": old_deadline_str,
            "new_deadline": new_deadline,
            "project_name": project["name"]
        }
    )

    return jsonify({"message": "마감일이 업데이트되었습니다.", "deadline": new_deadline}), 200


# 모든 프로젝트의 목록을 반환
@projects_bp.route("/projects", methods=["GET"])
@login_required
def get_all_projects():
    try:
        user_id = safe_object_id(current_user.get_id())
        projects = mongo.db.projects.find({"members": user_id})
        
        project_list = []
        for project in projects:
            # D-Day 계산 (선택 사항)
            deadline_str = project.get("deadline")
            d_day_status = None
            if deadline_str:
                if isinstance(deadline_str, datetime):
                    deadline_dt = deadline_str
                else:
                    try:
                        deadline_dt = datetime.strptime(deadline_str, "%Y-%m-%d")
                    except ValueError:
                        deadline_dt = None # 잘못된 형식은 무시

                if deadline_dt:
                    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                    deadline_only_date = deadline_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                    
                    diff = (deadline_only_date - today).days
                    if diff > 0:
                        d_day_status = f"D-{diff}"
                    elif diff == 0:
                        d_day_status = "D-Day"
                    else:
                        d_day_status = f"D+{abs(diff)}"
            
            project_list.append({
                "id": str(project["_id"]),
                "name": project["name"],
                "description": project.get("description", ""),
                "deadline": project["deadline"].strftime("%Y-%m-%d") if project.get("deadline") else None,
                "d_day": d_day_status, # D-Day 정보 추가
                "owner_id": str(project["owner"]),
            })
        
        logger.info(f"Retrieved {len(project_list)} projects for user {user_id}")
        return jsonify({"projects": project_list}), 200
    except Exception as e:
        return handle_db_error(e)