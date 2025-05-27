from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from flask_pymongo import PyMongo
from bson import ObjectId
from datetime import datetime
from app.utils.helpers import logger, safe_object_id, handle_db_error
from app.utils.history import log_history, get_project_history
from pymongo.errors import PyMongoError
from flask import render_template
from flask import jsonify
import os, uuid
from werkzeug.utils import secure_filename
from flask import current_app, url_for
import os
from flask import current_app

projects_bp = Blueprint('projects', __name__)


def init_projects(app):
    global mongo
    mongo = PyMongo(app)

@projects_bp.route("/projects/reorder", methods=["POST"])
@login_required
def reorder_projects():
    data = request.get_json()
    order = data.get("order", [])
    
    for index, project_id in enumerate(order):
        oid = safe_object_id(project_id)
        if not oid:
            continue
        mongo.db.projects.update_one(
            {"_id": oid, "members": ObjectId(current_user.get_id())},
            {"$set": {"order": index}}
        )
    
    return jsonify({"message": "프로젝트 순서가 업데이트되었습니다."}), 200

@projects_bp.route("/projects/order", methods=["GET"])
@login_required
def get_project_order():
    projects = mongo.db.projects.find({"members": ObjectId(current_user.get_id())}).sort("order", 1)
    order = [str(project["_id"]) for project in projects]
    return jsonify({"order": order}), 200

@projects_bp.route("/projects/create", methods=["POST"])
@login_required
def create_project():
    data = request.get_json()

    print("📥 수신된 deadline 원본 값:", data.get("deadline"))
    
    if not data or "name" not in data:
        logger.error("Missing project name in request")
        return jsonify({"message": "프로젝트 이름이 필요합니다."}), 400

    try:

        print("📦 전달된 deadline 값:", data.get("deadline"))

        deadline_str = data.get("deadline")
        deadline = None

        if deadline_str:
            try:
                deadline = datetime.strptime(deadline_str, "%Y-%m-%d")
            except ValueError:
                logger.warning(f"Invalid deadline format: {deadline_str}")

        max_order = mongo.db.projects.find({"members": ObjectId(current_user.get_id())}).sort("order", -1).limit(1)
        max_order_doc = next(max_order, None)
        max_order_value = max_order_doc["order"] + 1 if max_order_doc else 0

        new_project = {
            "name": data["name"],
            "description": data.get("description", ""),
            "deadline": deadline,
            "members": [ObjectId(current_user.get_id())],
            "owner": ObjectId(current_user.get_id()),
            "created_at": datetime.utcnow(),
            "order": max_order_value
        }

        print("📦 new_project 데이터:", new_project)

        result = mongo.db.projects.insert_one(new_project)

        return jsonify({"id": str(result.inserted_id), "name": new_project["name"]}), 201

        # 히스토리 기록
        log_history(
            mongo=mongo,
            project_id=str(result.inserted_id),
            card_id=None,
            user_id=current_user.get_id(),
            action="create",
            details={
                "project_name": new_project["name"],
                "username": current_user.username
            }
        )
    except Exception as e:
        return handle_db_error(e)

@projects_bp.route("/projects/<project_id>", methods=["DELETE"])
@login_required
def delete_or_leave_project(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"error": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"error": "프로젝트를 찾을 수 없습니다."}), 404

    user_id = ObjectId(current_user.get_id())
    if project.get("owner") == user_id:
        mongo.db.projects.delete_one({"_id": oid})
        mongo.db.cards.delete_many({"project_id": oid})
        logger.info(f"Deleted project: {project_id}")
        return jsonify({"message": "프로젝트가 삭제되었습니다."}), 200
    elif user_id in project.get("members", []):
        mongo.db.projects.update_one(
            {"_id": oid},
            {"$pull": {"members": user_id}}
        )

        # 히스토리 기록
        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=current_user.get_id(),
            action="leave",
            details={
                "project_name": project["name"],
                "username": current_user.username
            }
        )
        logger.info(f"User {user_id} left project: {project_id}")
        return jsonify({"message": "프로젝트에서 나갔습니다."}), 200

    logger.error(f"User {user_id} has no permission for project: {project_id}")
    return jsonify({"error": "권한이 없습니다."}), 403

@projects_bp.route("/projects/<project_id>", methods=["GET"])
@login_required
def get_project(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if project:
        logger.info(f"Retrieved project: {project_id}")
        return jsonify({
            "id": str(project["_id"]),
            "name": project["name"],
            "owner_id": str(project["owner"]),
        }), 200
    logger.error(f"Project not found: {project_id}")
    return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

@projects_bp.route('/projects/<project_id>/invite', methods=['POST'])
@login_required
def invite_member(project_id):
    data = request.get_json()
    username = data.get('username')
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    user = mongo.db.users.find_one({"username": username})
    project = mongo.db.projects.find_one({"_id": oid})
    if not user or not project:
        logger.error(f"User {username} or project {project_id} not found")
        return jsonify({"message": "사용자 또는 프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(user["_id"]) in project.get("members", []):
        logger.error(f"User {username} already a member of project {project_id}")
        return jsonify({"message": "이미 프로젝트 멤버입니다."}), 400

    if ObjectId(project["_id"]) in user.get("invitations", []):
        logger.error(f"User {username} already invited to project {project_id}")
        return jsonify({"message": "이미 초대된 사용자입니다."}), 400

    mongo.db.users.update_one(
        {"_id": user["_id"]},
        {"$push": {"invitations": project["_id"]}}
    )
    logger.info(f"Sent invitation to {username} for project {project_id}")
    return jsonify({"message": "초대가 전송되었습니다."}), 200

@projects_bp.route('/invitations', methods=['GET'])
@login_required
def get_invitations():
    user_data = mongo.db.users.find_one({"_id": ObjectId(current_user.get_id())})
    invitations = list(mongo.db.projects.find({"_id": {"$in": user_data.get("invitations", [])}}))
    logger.info(f"Retrieved {len(invitations)} invitations for user {current_user.get_id()}")
    return jsonify({
        "invitations": [{"id": str(p["_id"]), "name": p["name"]} for p in invitations]
    })

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

    mongo.db.users.update_one(
        {"_id": ObjectId(current_user.get_id())},
        {"$pull": {"invitations": project_id}}
    )

    if action == "accept":
        mongo.db.projects.update_one(
            {"_id": project_id},
            {"$addToSet": {"members": ObjectId(current_user.get_id())}}
        )
        
        # 히스토리 기록
        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=current_user.get_id(),
            action="join",
            details={
                "project_name": project["name"],
                "username": current_user.username
            }
        )
        logger.info(f"User {current_user.get_id()} accepted invitation for project {project_id}")
    else:
        logger.info(f"User {current_user.get_id()} declined invitation for project {project_id}")

    return jsonify({"message": f"{action} 처리 완료"}), 200

@projects_bp.route("/projects/search", methods=["GET"])
@login_required
def search_projects_and_cards():
    try:
        keyword = request.args.get("keyword", "").strip()
        if not keyword:
            return jsonify({"projects": [], "cards": [], "message": "키워드가 필요합니다."}), 200

        project_query = {
            "$or": [
                {"name": {"$regex": keyword, "$options": "i"}},
                {"description": {"$regex": keyword, "$options": "i"}}
            ],
            "members": ObjectId(current_user.get_id())
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
                "members": ObjectId(current_user.get_id())
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
    except PyMongoError as e:
        logger.error(f"Search error: {str(e)}")
        return handle_db_error(e)
    except Exception as e:
        logger.error(f"Unexpected search error: {str(e)}")
        return jsonify({"message": "서버 오류가 발생했습니다."}), 500

@projects_bp.route("/history/<project_id>", methods=["GET"])
@login_required
def get_history(project_id):
    history_list, response, status = get_project_history(mongo, project_id, current_user.get_id())
    return jsonify(response), status



@projects_bp.route("/projects/<project_id>/comments", methods=["GET"])
@login_required
def get_comments(project_id):
    comments = list(mongo.db.comments
                    .find({"project_id": ObjectId(project_id)})
                    .sort("created_at", 1))
    result = []
    for c in comments:
        item = {
            "_id": str(c["_id"]),
            "author_id": str(c["author_id"]),
            "author_name": c["author_name"],
            "content": c["content"],
            "created_at": c["created_at"].strftime("%Y-%m-%d %H:%M")
        }
        if c.get("image_filename"):
            item["image_url"] = url_for('static', filename=f"uploads/{c['image_filename']}")
        result.append(item)
    return jsonify({"comments": result}), 200

@projects_bp.route("/projects/<project_id>/comments", methods=["POST"])
@login_required
def add_comment(project_id):
    # 1) 텍스트
    content = request.form.get("content", "").strip()

    # 2) 파일
    file = request.files.get("image")

    if not content and not file:
        return jsonify({"error": "댓글 또는 이미지를 입력하세요."}), 400

    # 3) 업로드 폴더 준비
    upload_dir = os.path.join(current_app.static_folder, "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    image_filename = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1]
        # uuid로 고유 이름 생성
        image_filename = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(upload_dir, image_filename)
        file.save(save_path)
        
        print("Saved comment image as:", image_filename)

    # 4) DB 저장
    new_comment = {
        "project_id": ObjectId(project_id),
        "author_id": ObjectId(current_user.get_id()),
        "author_name": current_user.username,
        "content": content,
        "created_at": datetime.utcnow()
    }
    if image_filename:
        new_comment["image_filename"] = image_filename

    mongo.db.comments.insert_one(new_comment)
    return jsonify({"message": "ok"}), 201

@projects_bp.route("/comments/<comment_id>", methods=["PUT"])
@login_required
def edit_comment(comment_id):
    if request.content_type.startswith("application/json"):
        # JSON 요청
        data = request.get_json()
        content = data.get("content", "").strip()
        delete_image = False
        new_file = None
    else:
        # FormData 요청
        content = request.form.get("content", "").strip()
        delete_image = request.form.get("delete_image") == "1"
        new_file = request.files.get("image")

    if not content:
        return jsonify({"error": "내용 필요"}), 400
    comment = mongo.db.comments.find_one({"_id": ObjectId(comment_id)})
    if not comment or str(comment["author_id"]) != current_user.get_id():
        return jsonify({"error": "권한 없음"}), 403
    upload_dir = os.path.join(current_app.static_folder, "uploads")
    # 1) 기존 이미지 삭제 요청 처리
    if delete_image and comment.get("image_filename"):
        old_path = os.path.join(upload_dir, comment["image_filename"])
        if os.path.exists(old_path):
            os.remove(old_path)
        mongo.db.comments.update_one(
            {"_id": ObjectId(comment_id)},
            {"$unset": {"image_filename": ""}}
        )
        comment.pop("image_filename", None)

    # 2) 새 이미지 업로드 처리
    if new_file and new_file.filename:
        # 기존 이미지도 지우기
        if comment.get("image_filename"):
            old_path = os.path.join(upload_dir, comment["image_filename"])
            if os.path.exists(old_path):
                os.remove(old_path)
        # 새 파일 저장
        ext = os.path.splitext(new_file.filename)[1]
        image_filename = f"{uuid.uuid4().hex}{ext}"
        new_file.save(os.path.join(upload_dir, image_filename))
        mongo.db.comments.update_one(
            {"_id": ObjectId(comment_id)},
            {"$set": {"image_filename": image_filename}}
        )

    # 3) 텍스트 변경
    mongo.db.comments.update_one(
        {"_id": ObjectId(comment_id)},
        {"$set": {"content": content}}
    )

    return jsonify({"message": "수정됨"}), 200

@projects_bp.route("/comments/<comment_id>", methods=["DELETE"])
@login_required
def delete_comment(comment_id):
    comment = mongo.db.comments.find_one({"_id": ObjectId(comment_id)})
    if not comment or str(comment["author_id"]) != current_user.get_id():
        return jsonify({"error": "권한 없음"}), 403
    if comment.get("image_filename"):
        file_path = os.path.join(current_app.static_folder, "uploads", comment["image_filename"])
        if os.path.exists(file_path):
            os.remove(file_path)

    mongo.db.comments.delete_one({"_id": ObjectId(comment_id)})
    return jsonify({"message": "삭제됨"})

#마감일 수정
@projects_bp.route('/projects/<project_id>/deadline', methods=['PUT'])
@login_required
def update_deadline(project_id):
    data = request.get_json()
    new_deadline = data.get('deadline')
    if not new_deadline:
        return jsonify({'error': 'Deadline is required.'}), 400
    try:
        deadline_dt = datetime.strptime(new_deadline, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Invalid date format.'}), 400

    proj = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
    if not proj:
        return jsonify({'error': 'Project not found.'}), 404
    if str(proj.get('owner')) != current_user.get_id():
        return jsonify({'error': 'Permission denied.'}), 403

    # 실제 마감일 업데이트
    mongo.db.projects.update_one(
        {'_id': ObjectId(project_id)},
        {'$set': {'deadline': deadline_dt}}
    )

    # ▶ 변경 히스토리 기록
    from app.utils.history import log_history
    log_history(
        mongo=mongo,
        project_id=project_id,
        card_id=None,
        user_id=current_user.get_id(),
        action="update_deadline",
        details={
            "old_deadline": proj.get('deadline').strftime("%Y-%m-%d") if proj.get('deadline') else None,
            "new_deadline": new_deadline
        }
    )

    return jsonify({'success': True, 'deadline': new_deadline}), 200