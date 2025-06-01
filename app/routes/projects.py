from flask import Blueprint, request, jsonify, current_app, url_for
from flask_login import login_required, current_user
from flask_pymongo import PyMongo
from bson import ObjectId
from datetime import datetime
from app.utils.helpers import logger, safe_object_id, handle_db_error
from app.utils.history import log_history
import os
import uuid
from werkzeug.utils import secure_filename

projects_bp = Blueprint('projects', __name__)

def init_projects(app):
    global mongo
    mongo = PyMongo(app)

@projects_bp.route("/projects/reorder", methods=["POST"])
@login_required
def reorder_projects():
    data = request.get_json()
    order = data.get("order", [])
    
    user_id = ObjectId(current_user.get_id())
    for index, project_id in enumerate(order):
        oid = safe_object_id(project_id)
        if not oid:
            continue
        project = mongo.db.projects.find_one({"_id": oid, "members": user_id})
        if project:
            mongo.db.projects.update_one(
                {"_id": oid},
                {"$set": {"order": index}}
            )
    
    return jsonify({"message": "프로젝트 순서가 업데이트되었습니다."}), 200

@projects_bp.route("/projects/order", methods=["GET"])
@login_required
def get_project_order():
    user_id = ObjectId(current_user.get_id())
    projects = mongo.db.projects.find({"members": user_id}).sort("order", 1)
    order = [str(project["_id"]) for project in projects]
    return jsonify({"order": order}), 200

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

        user_id = ObjectId(current_user.get_id())
        max_order = mongo.db.projects.find({"members": user_id}).sort("order", -1).limit(1)
        max_order_doc = next(max_order, None)
        max_order_value = max_order_doc["order"] + 1 if max_order_doc else 0

        new_project = {
            "name": data["name"],
            "description": data.get("description", ""),
            "deadline": deadline,
            "members": [user_id],
            "owner": user_id,
            "created_at": datetime.utcnow(),
            "order": max_order_value
        }

        result = mongo.db.projects.insert_one(new_project)
        project_id = str(result.inserted_id)

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(user_id),
            action="create",
            details={
                "project_name": new_project["name"],
                "nickname": current_user.nickname
            }
        )

        return jsonify({"id": project_id, "name": new_project["name"]}), 201
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

    user_id = ObjectId(current_user.get_id())
    if project.get("owner") == user_id:
        mongo.db.projects.delete_one({"_id": oid})
        mongo.db.cards.delete_many({"project_id": oid})
        mongo.db.comments.delete_many({"project_id": oid})

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(user_id),
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

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=str(user_id),
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

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(current_user.get_id())})
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

@projects_bp.route('/projects/<project_id>/invite', methods=['POST'])
@login_required
def invite_member(project_id):
    data = request.get_json()
    invitee_nickname = data.get('nickname')
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    invitee = mongo.db.users.find_one({"nickname": invitee_nickname})
    if not invitee:
        logger.error(f"User {invitee_nickname} not found")
        return jsonify({"message": "사용자를 찾을 수 없습니다."}), 404

    if ObjectId(invitee["_id"]) in project.get("members", []):
        logger.error(f"User {invitee_nickname} already a member of project {project_id}")
        return jsonify({"message": "이미 프로젝트 멤버입니다."}), 400

    if ObjectId(project_id) in invitee.get("invitations", []):
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
    user_id = ObjectId(current_user.get_id())
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

    user_id = ObjectId(current_user.get_id())
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

@projects_bp.route("/projects/search", methods=["GET"])
@login_required
def search_projects_and_cards():
    try:
        keyword = request.args.get("keyword", "").strip()
        if not keyword:
            return jsonify({"projects": [], "cards": [], "message": "키워드가 필요합니다."}), 200

        user_id = ObjectId(current_user.get_id())
        project_query = {
            "$or": [
                {"name": {"$regex": keyword, "$options": "i"}},
                {"description": {"$regex": keyword, "$options": "i"}}
            ],
            "members": user_id
        }
        projects = mongo.db.projects.find(project_query)
        project_results = [
            {
                "id": str(project["_id"]),
                "name": project["name"],
                "description": project.get("description", ""),
                "type": "project"
            }
            for project in projects
        ]

        card_query = {
            "$or": [
                {"title": {"$regex": keyword, "$options": "i"}},
                {"description": {"$regex": keyword, "$options": "i"}}
            ]
        }
        cards = mongo.db.cards.find(card_query)
        card_results = []
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

        logger.info(f"Search executed: keyword={keyword}, projects={len(project_results)}, cards={len(card_results)}")
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

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    history = list(mongo.db.history.find({"project_id": project_id}).sort("timestamp", -1))
    return jsonify({
        "history": [{
            "id": str(h["_id"]),
            "action": h["action"],
            "details": h["details"],
            "user_id": h["user_id"],
            "timestamp": h["timestamp"].strftime("%H:%M:%S")
        } for h in history]
    }), 200

@projects_bp.route("/projects/<project_id>/comments", methods=["GET"])
@login_required
def get_comments(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    comments = list(mongo.db.comments.find({"project_id": oid}).sort("created_at", 1))
    result = []
    for c in comments:
        item = {
            "id": str(c["_id"]),
            "author_id": str(c["author_id"]),
            "author_name": c["author_name"],
            "content": c["content"],
            "created_at": c["created_at"].strftime("%H:%M:%S")
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

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    content = request.form.get("content", "").strip()
    file = request.files.get("image")

    if not content and not file:
        return jsonify({"message": "댓글 또는 이미지를 입력하세요."}), 400

    user_id = ObjectId(current_user.get_id())
    upload_dir = os.path.join(current_app.static_folder, "Uploads")
    os.makedirs(upload_dir, exist_ok=True)

    image_filename = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1]
        image_filename = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(upload_dir, image_filename)
        file.save(save_path)
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
        action="comment_create",
        details={
            "content": content,
            "project_name": project["name"]
        }
    )

    return jsonify({"message": "댓글이 추가되었습니다.", "id": comment_id}), 201

@projects_bp.route("/comments/<comment_id>", methods=["PUT"])
@login_required
def edit_comment(comment_id):
    oid = safe_object_id(comment_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 댓글 ID입니다."}), 400

    comment = mongo.db.comments.find_one({"_id": oid})
    if not comment:
        logger.error(f"Comment not found: {comment_id}")
        return jsonify({"message": "댓글을 찾을 수 없습니다."}), 404

    project = mongo.db.projects.find_one({"_id": comment["project_id"], "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access for comment: {comment_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    if str(comment["author_id"]) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} has no permission to edit comment: {comment_id}")
        return jsonify({"message": "댓글 수정 권한이 없습니다."}), 403

    content = None
    delete_image = False
    new_file = None
    if request.content_type.startswith("application/json"):
        data = request.get_json()
        content = data.get("content", "").strip()
        delete_image = data.get("delete_image", False)
    else:
        content = request.form.get("content", "").strip()
        delete_image = request.form.get("delete_image") == "1"
        new_file = request.files.get("image")

    if not content:
        return jsonify({"message": "댓글 내용이 필요합니다."}), 400

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

    mongo.db.comments.update_one(
        {"_id": oid},
        {"$set": {"content": content}}
    )

    log_history(
        mongo=mongo,
        project_id=str(comment["project_id"]),
        card_id=None,
        user_id=str(current_user.get_id()),
        action="comment_update",
        details={
            "old_content": comment["content"],
            "new_content": content,
            "project_name": project["name"]
        }
    )

    return jsonify({"message": "댓글이 수정되었습니다."}), 200

@projects_bp.route("/comments/<comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    oid = safe_object_id(comment_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 댓글 ID입니다."}), 400

    comment = mongo.db.comments.find_one({"_id": oid})
    if not comment:
        logger.error(f"Comment not found: {comment_id}")
        return jsonify({"message": "댓글을 찾을 수 없습니다."}), 404

    project = mongo.db.projects.find_one({"_id": comment["project_id"], "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access for comment: {comment_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    if str(comment["author_id"]) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} has no permission to delete comment: {comment_id}")
        return jsonify({"message": "댓글 삭제 권한이 없습니다."}), 403

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
        action="comment_delete",
        details={
            "content": comment["content"],
            "project_name": project["name"]
        }
    )

    return jsonify({"message": "댓글이 삭제되었습니다."}), 200

@projects_bp.route('/projects/<project_id>/deadline', methods=['PUT'])
@login_required
def update_deadline(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(current_user.get_id())})
    if not project:
        logger.error(f"Project not found or user has no access: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}), 404

    if str(project.get('owner')) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} not owner of project: {project_id}")
        return jsonify({"message": "프로젝트 소유자만 마감일을 수정할 수 있습니다."}), 403

    data = request.get_json()
    new_deadline = data.get('deadline')
    if not new_deadline:
        return jsonify({"message": "마감일이 필요합니다."}), 400

    try:
        deadline_dt = datetime.strptime(new_deadline, '%Y-%m-%d')
    except ValueError:
        logger.error(f"Invalid date format: {new_deadline}")
        return jsonify({"message": "유효하지 않은 날짜 형식입니다."}), 400

    mongo.db.projects.update_one(
        {"_id": oid},
        {"$set": {"deadline": deadline_dt}}
    )

    log_history(
        mongo=mongo,
        project_id=project_id,
        card_id=None,
        user_id=str(current_user.get_id()),
        action="update_deadline",
        details={
            "old_deadline": project.get('deadline').strftime("%Y-%m-%d") if project.get('deadline') else None,
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
        user_id = ObjectId(current_user.get_id())
        projects = mongo.db.projects.find({"members": user_id}).sort("order", 1)
        
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
                "order": project.get("order", 0)
            })
        
        logger.info(f"Retrieved {len(project_list)} projects for user {user_id}")
        return jsonify({"projects": project_list}), 200
    except Exception as e:
        return handle_db_error(e)