from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from flask_pymongo import PyMongo
from bson import ObjectId
from datetime import datetime
from pymongo.errors import PyMongoError
from app.utils.helpers import logger, safe_object_id, handle_db_error
from app.utils.history import log_history, get_project_history

cards_bp = Blueprint('cards', __name__)

def init_cards(app, socketio_instance):
    global mongo
    socketio = socketio_instance
    mongo = PyMongo(app)
    # socketio는 인자로 받아 사용, 초기화 제거

@cards_bp.route("/projects/all/cards", methods=["GET"])
@login_required
def get_all_cards():
    projects = mongo.db.projects.find({"members": ObjectId(current_user.get_id())})
    project_ids = [project["_id"] for project in projects]
    
    cards = list(mongo.db.cards.find({"project_id": {"$in": project_ids}}).sort("order", 1))
    logger.info(f"Retrieved {len(cards)} cards for user {current_user.get_id()}")
    return jsonify({
        "cards": [{
            "id": str(card["_id"]),
            "title": card["title"],
            "description": card["description"],
            "status": card["status"],
            "project_id": str(card["project_id"]),
            "created_by": str(card["created_by"]),
            "created_at": card["created_at"].isoformat(),
            "order": card.get("order", 0),
            "due_date": card.get("due_date", "").isoformat() if card.get("due_date") else None
        } for card in cards]
    }), 200

@cards_bp.route("/projects/all/cards/counts", methods=["GET"])
@login_required
def get_card_counts():
    projects = mongo.db.projects.find({"members": ObjectId(current_user.get_id())})
    counts = {}
    
    for project in projects:
        project_id = str(project["_id"])
        count = mongo.db.cards.count_documents({"project_id": project["_id"]})
        counts[project_id] = count
    
    logger.info(f"Retrieved card counts for user {current_user.get_id()}")
    return jsonify({"counts": counts}), 200

@cards_bp.route("/projects/<project_id>/cards/move", methods=["POST"])
@login_required
def move_card(project_id):
    data = request.get_json()
    if not data:
        logger.error("No JSON payload received")
        return jsonify({"message": "요청 데이터가 없습니다."}), 400

    card_id = data.get("cardId")
    target_project_id = data.get("projectId")
    source_project_id = data.get("sourceProjectId")
    order = data.get("order", [])

    missing_fields = []
    if not card_id:
        missing_fields.append("cardId")
    if not target_project_id:
        missing_fields.append("projectId")
    if not source_project_id:
        missing_fields.append("sourceProjectId")
    if missing_fields:
        logger.error(f"Missing required fields: {', '.join(missing_fields)}")
        return jsonify({"message": f"다음 필드가 누락되었습니다: {', '.join(missing_fields)}"}), 400

    oid = safe_object_id(project_id)
    source_oid = safe_object_id(source_project_id)
    card_oid = safe_object_id(card_id)
    target_oid = safe_object_id(target_project_id)
    if not all([oid, source_oid, card_oid, target_oid]):
        logger.error(f"Invalid IDs: project_id={project_id}, source_project_id={source_project_id}, card_id={card_id}, target_project_id={target_project_id}")
        return jsonify({"message": "유효하지 않은 ID입니다."}), 400

    if oid != source_oid:
        logger.error(f"Project ID mismatch: URL project_id={project_id}, payload sourceProjectId={source_project_id}")
        return jsonify({"message": "프로젝트 ID가 일치하지 않습니다."}), 400

    try:
        project = mongo.db.projects.find_one({"_id": target_oid})
        if not project:
            logger.error(f"Target project not found: {target_project_id}")
            return jsonify({"message": "대상 프로젝트를 찾을 수 없습니다."}), 404

        if ObjectId(current_user.get_id()) not in project.get("members", []):
            logger.error(f"User {current_user.get_id()} not a member of project {target_project_id}")
            return jsonify({"message": "권한이 없습니다."}), 403

        card = mongo.db.cards.find_one({"_id": card_oid, "project_id": source_oid})
        if not card:
            logger.error(f"Card {card_id} not found in source project {source_project_id}")
            return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

        from_project = mongo.db.projects.find_one({"_id": source_oid})
        to_project = mongo.db.projects.find_one({"_id": target_oid})
        if not from_project or not to_project:
            logger.error(f"Project lookup failed: from {source_project_id}, to {target_project_id}")
            return jsonify({"message": "프로젝트 정보를 가져올 수 없습니다."}), 404

        mongo.db.cards.update_one(
            {"_id": card_oid},
            {"$set": {"project_id": target_oid}}
        )

        history_details = {
            "from_project": from_project["name"],
            "to_project": to_project["name"],
            "title": card["title"]
        }

        if from_project != to_project:
            log_history(
                mongo,
                source_project_id,
                card_id,
                current_user.get_id(),
                "card_move_out",
                history_details
            )

        log_history(
            mongo,
            target_project_id,
            card_id,
            current_user.get_id(),
            "card_move_in",
            history_details
        )

        order_oids = [safe_object_id(cid) for cid in order]
        if None in order_oids:
            logger.error(f"Invalid card IDs in order: {order}")
            return jsonify({"error": "유효하지 않은 카드 ID입니다."}), 400

        for index, cid in enumerate(order_oids):
            card_check = mongo.db.cards.find_one({"_id": cid, "project_id": target_oid})
            if not card_check:
                logger.error(f"Card {cid} not found in project {target_project_id}")
                return jsonify({"error": f"카드 {cid}를 프로젝트에서 찾을 수 없습니다."}), 404

            mongo.db.cards.update_one(
                {"_id": cid, "project_id": target_oid},
                {"$set": {"order": index}}
            )

        # 소켓 이벤트: 카드 업데이트 (이동 및 순서 변경)
        socketio.emit('card_updated', {
            'project_id': target_project_id,
            'card_id': card_id,
            'updates': {'project_id': target_project_id, 'order': order.index(card_id) if card_id in order else 0},
            'username': current_user.username,
            'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        }, room=target_project_id)

        if source_project_id != target_project_id:
            socketio.emit('card_updated', {
                'project_id': source_project_id,
                'card_id': card_id,
                'updates': {'project_id': target_project_id},
                'username': current_user.username,
                'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            }, room=source_project_id)

        logger.info(f"Card {card_id} moved from project {source_project_id} to {target_project_id} with order {order}")
        return jsonify({"message": "카드가 이동되고 순서가 업데이트되었습니다."}), 200

    except PyMongoError as e:
        logger.error(f"Database error: {str(e)}")
        return handle_db_error(e)
    except Exception as e:
        logger.error(f"Unexpected error in move_card: {str(e)}")
        return jsonify({"message": "서버 내부 오류가 발생했습니다."}), 500

@cards_bp.route("/projects/<project_id>/cards", methods=["POST"])
@login_required
def create_card(project_id):
    data = request.get_json()
    if not data or "title" not in data:
        logger.error("Missing card title in request")
        return jsonify({"message": "카드 제목이 필요합니다."}), 400

    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    try:
        max_order_doc = mongo.db.cards.find({"project_id": oid}).sort("order", -1).limit(1)
        max_order_doc = next(max_order_doc, None)
        max_order = max_order_doc["order"] + 1 if max_order_doc else 0

        new_card = {
            "project_id": oid,
            "title": data["title"],
            "description": data.get("description", ""),
            "created_by": ObjectId(current_user.get_id()),
            "created_at": datetime.utcnow(),
            "status": data.get("status", "todo"),
            "order": max_order
        }

        result = mongo.db.cards.insert_one(new_card)
        log_history(
            mongo,
            project_id,
            str(result.inserted_id),
            current_user.get_id(),
            "card_create",
            {
                "title": new_card["title"],
                "status": new_card["status"]
            }
        )

        # 소켓 이벤트: 카드 생성
        socketio.emit('card_created', {
            'project_id': project_id,
            'card_title': new_card["title"],
            'username': current_user.username,
            'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        }, room=project_id)

        logger.info(f"Created card: {result.inserted_id} in project {project_id} with status {new_card['status']}")
        return jsonify({
            "id": str(result.inserted_id),
            "title": new_card["title"],
            "description": new_card["description"],
            "status": new_card["status"],
            "project_id": str(new_card["project_id"]),
            "order": new_card["order"]
        }), 201
    except Exception as e:
        return handle_db_error(e)

@cards_bp.route("/projects/<project_id>/cards/<card_id>", methods=["DELETE"])
@login_required
def delete_card(project_id, card_id):
    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "card_delete",
        {"title": card["title"]}
    )

    mongo.db.cards.delete_one({"_id": card_oid})

    # 소켓 이벤트: 카드 삭제
    socketio.emit('card_deleted', {
        'project_id': project_id,
        'card_id': card_id,
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Deleted card: {card_id} from project {project_id}")
    return jsonify({"message": "카드가 삭제되었습니다."}), 200

@cards_bp.route("/projects/<project_id>/cards", methods=["GET"])
@login_required
def get_project_cards(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({"message": "유효하지 않은 프로젝트 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    cards = list(mongo.db.cards.find({"project_id": oid}).sort("order", 1))
    logger.info(f"Retrieved {len(cards)} cards for project {project_id}")
    return jsonify({
        "cards": [{
            "id": str(card["_id"]),
            "title": card["title"],
            "description": card["description"],
            "status": card["status"],
            "project_id": str(card["project_id"]),
            "created_by": str(card["created_by"]),
            "created_at": card["created_at"].isoformat(),
            "order": card.get("order", 0),
            "due_date": card.get("due_date", "").isoformat() if card.get("due_date") else None
        } for card in cards]
    }), 200

@cards_bp.route("/projects/<project_id>/cards/<card_id>/status", methods=["PUT"])
@login_required
def update_card_status(project_id, card_id):
    data = request.get_json()
    if not data or "status" not in data:
        logger.error("Missing status in request")
        return jsonify({"message": "상태 정보가 필요합니다."}), 400

    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "card_status_update",
        {
            "from_status": card["status"],
            "to_status": data["status"],
            "title": card["title"]
        }
    )

    mongo.db.cards.update_one(
        {"_id": card_oid},
        {"$set": {"status": data["status"]}}
    )

    # 소켓 이벤트: 카드 업데이트 (상태 변경)
    socketio.emit('card_updated', {
        'project_id': project_id,
        'card_id': card_id,
        'updates': {'status': data["status"]},
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Updated status of card {card_id} to {data['status']}")
    return jsonify({"message": "카드 상태가 업데이트되었습니다."}), 200

@cards_bp.route('/projects/<project_id>/cards/reorder', methods=['POST'])
@login_required
def reorder_cards(project_id):
    oid = safe_object_id(project_id)
    if not oid:
        return jsonify({'error': '유효하지 않은 프로젝트 ID입니다.'}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({'error': '프로젝트를 찾을 수 없습니다.'}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"error": "권한이 없습니다."}), 403

    data = request.get_json()
    order = data.get("order")
    if not isinstance(order, list):
        logger.error(f"Invalid order format: {order}")
        return jsonify({'error': 'Order must be a list of card IDs'}), 400

    order_oids = [safe_object_id(card_id) for card_id in order]
    if None in order_oids:
        return jsonify({'error': '유효하지 않은 카드 ID입니다.'}), 400

    for card_id in order_oids:
        card = mongo.db.cards.find_one({"_id": card_id, "project_id": oid})
        if not card:
            logger.error(f"Card {card_id} not found in project {project_id}")
            return jsonify({'error': f"카드 {card_id}를 찾을 수 없습니다."}), 404

    try:
        with mongo.cx.start_session() as session:
            with session.start_transaction():
                for index, card_id in enumerate(order_oids):
                    mongo.db.cards.update_one(
                        {"_id": card_id, "project_id": oid},
                        {"$set": {"order": index}},
                        session=session
                    )
                    # 히스토리 기록
                    card = mongo.db.cards.find_one({"_id": card_id})
                    log_history(
                        mongo,
                        project_id,
                        str(card_id),
                        current_user.get_id(),
                        "card_reorder",
                        {"title": card["title"], "new_order": index}
                    )

                    # 소켓 이벤트: 카드 업데이트 (순서 변경)
                    socketio.emit('card_updated', {
                        'project_id': project_id,
                        'card_id': str(card_id),
                        'updates': {'order': index},
                        'username': current_user.username,
                        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
                    }, room=project_id)

        logger.info(f"Cards reordered in project {project_id}")
        return jsonify({'message': '카드 순서가 업데이트되었습니다.'}), 200
    except PyMongoError as e:
        return handle_db_error(e)

@cards_bp.route("/projects/<project_id>/cards/<card_id>", methods=["PUT"])
@login_required
def update_card(project_id, card_id):
    data = request.get_json()
    if not data or "title" not in data:
        logger.error("Missing card title in request")
        return jsonify({"message": "카드 제목이 필요합니다."}), 400

    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    update_data = {
        "title": data["title"],
        "description": data.get("description", ""),
        "status": data.get("status", card["status"])
    }

    changes = {}
    if card["title"] != data["title"]:
        changes["title"] = {"from": card["title"], "to": data["title"]}
    if card["description"] != data.get("description", ""):
        changes["description"] = {"from": card["description"], "to": data.get("description", "")}
    if card["status"] != update_data["status"]:
        changes["status"] = {"from": card["status"], "to": update_data["status"]}
        log_history(
            mongo,
            project_id,
            card_id,
            current_user.get_id(),
            "card_status_update",
            {
                "from_status": card["status"],
                "to_status": update_data["status"],
                "title": card["title"]
            }
        )

    if changes:
        log_history(
            mongo,
            project_id,
            card_id,
            current_user.get_id(),
            "card_update",
            changes
        )

    mongo.db.cards.update_one(
        {"_id": card_oid},
        {"$set": update_data}
    )

    # 소켓 이벤트: 카드 업데이트
    socketio.emit('card_updated', {
        'project_id': project_id,
        'card_id': card_id,
        'updates': update_data,
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Updated card: {card_id} in project {project_id}")
    return jsonify({"message": "카드가 수정되었습니다."}), 200

@cards_bp.route("/projects/<project_id>/cards/<card_id>", methods=["GET"])
@login_required
def get_card(project_id, card_id):
    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    logger.info(f"Retrieved card: {card_id} from project {project_id}")
    return jsonify({
        "id": str(card["_id"]),
        "title": card["title"],
        "description": card["description"],
        "status": card["status"],
        "project_id": str(card["project_id"]),
        "created_by": str(card["created_by"]),
        "created_at": card["created_at"].isoformat(),
        "order": card.get("order", 0),
        "due_date": card.get("due_date", "").isoformat() if card.get("due_date") else None
    }), 200

@cards_bp.route("/projects/<project_id>/cards/<card_id>/due_date", methods=["POST"])
@login_required
def set_due_date(project_id, card_id):
    data = request.get_json()
    if not data or "due_date" not in data:
        logger.error("Missing due_date in request")
        return jsonify({"message": "마감일이 필요합니다."}), 400

    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    try:
        due_date = datetime.strptime(data["due_date"], "%Y-%m-%d")
    except ValueError:
        logger.error(f"Invalid due_date format: {data['due_date']}")
        return jsonify({"message": "유효하지 않은 날짜 형식입니다."}), 400

    mongo.db.cards.update_one(
        {"_id": card_oid},
        {"$set": {"due_date": due_date}}
    )

    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "card_due_date_set",
        {"title": card["title"], "due_date": data["due_date"]}
    )

    # 소켓 이벤트: 마감일 설정
    socketio.emit('due_date_set', {
        'project_id': project_id,
        'card_id': card_id,
        'due_date': data["due_date"],
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Set due date for card {card_id} in project {project_id}: {data['due_date']}")
    return jsonify({"message": "마감일이 설정되었습니다."}), 200

@cards_bp.route("/projects/<project_id>/cards/<card_id>/due_date", methods=["PUT"])
@login_required
def update_due_date(project_id, card_id):
    data = request.get_json()
    if not data or "due_date" not in data:
        logger.error("Missing due_date in request")
        return jsonify({"message": "마감일이 필요합니다."}), 400

    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    try:
        new_due_date = datetime.strptime(data["due_date"], "%Y-%m-%d")
    except ValueError:
        logger.error(f"Invalid due_date format: {data['due_date']}")
        return jsonify({"message": "유효하지 않은 날짜 형식입니다."}), 400

    mongo.db.cards.update_one(
        {"_id": card_oid},
        {"$set": {"due_date": new_due_date}}
    )

    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "card_due_date_updated",
        {
            "title": card["title"],
            "old_due_date": card.get("due_date", "").strftime("%Y-%m-%d") if card.get("due_date") else None,
            "new_due_date": data["due_date"]
        }
    )

    # 소켓 이벤트: 마감일 수정
    socketio.emit('due_date_updated', {
        'project_id': project_id,
        'card_id': card_id,
        'new_due_date': data["due_date"],
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Updated due date for card {card_id} in project {project_id}: {data['due_date']}")
    return jsonify({"message": "마감일이 수정되었습니다."}), 200

@cards_bp.route("/projects/<project_id>/cards/<card_id>/comments", methods=["POST"])
@login_required
def create_comment(project_id, card_id):
    data = request.get_json()
    if not data or "content" not in data:
        logger.error("Missing comment content in request")
        return jsonify({"message": "댓글 내용이 필요합니다."}), 400

    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    if not all([oid, card_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트 또는 카드 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    new_comment = {
        "project_id": oid,
        "card_id": card_oid,
        "author_id": ObjectId(current_user.get_id()),
        "author_name": current_user.username,
        "content": data["content"],
        "created_at": datetime.utcnow()
    }

    result = mongo.db.comments.insert_one(new_comment)
    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "comment_create",
        {"content": data["content"], "title": card["title"]}
    )

    # 소켓 이벤트: 댓글 작성
    socketio.emit('comment_created', {
        'project_id': project_id,
        'card_id': card_id,
        'comment': data["content"],
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Created comment for card {card_id} in project {project_id}")
    return jsonify({"message": "댓글이 작성되었습니다.", "comment_id": str(result.inserted_id)}), 201

@cards_bp.route("/projects/<project_id>/cards/<card_id>/comments/<comment_id>", methods=["PUT"])
@login_required
def update_comment(project_id, card_id, comment_id):
    data = request.get_json()
    if not data or "content" not in data:
        logger.error("Missing comment content in request")
        return jsonify({"message": "댓글 내용이 필요합니다."}), 400

    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    comment_oid = safe_object_id(comment_id)
    if not all([oid, card_oid, comment_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트, 카드 또는 댓글 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    comment = mongo.db.comments.find_one({"_id": comment_oid, "card_id": card_oid})
    if not comment:
        logger.error(f"Comment not found: {comment_id}")
        return jsonify({"message": "댓글을 찾을 수 없습니다."}), 404

    if str(comment["author_id"]) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} not authorized to edit comment {comment_id}")
        return jsonify({"message": "댓글 수정 권한이 없습니다."}), 403

    mongo.db.comments.update_one(
        {"_id": comment_oid},
        {"$set": {"content": data["content"]}}
    )

    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "comment_update",
        {"old_content": comment["content"], "new_content": data["content"], "title": card["title"]}
    )

    # 소켓 이벤트: 댓글 수정
    socketio.emit('comment_updated', {
        'project_id': project_id,
        'card_id': card_id,
        'comment_id': comment_id,
        'new_comment': data["content"],
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Updated comment {comment_id} for card {card_id} in project {project_id}")
    return jsonify({"message": "댓글이 수정되었습니다."}), 200

@cards_bp.route("/projects/<project_id>/cards/<card_id>/comments/<comment_id>", methods=["DELETE"])
@login_required
def delete_comment(project_id, card_id, comment_id):
    oid = safe_object_id(project_id)
    card_oid = safe_object_id(card_id)
    comment_oid = safe_object_id(comment_id)
    if not all([oid, card_oid, comment_oid]):
        return jsonify({"message": "유효하지 않은 프로젝트, 카드 또는 댓글 ID입니다."}), 400

    project = mongo.db.projects.find_one({"_id": oid})
    if not project:
        logger.error(f"Project not found: {project_id}")
        return jsonify({"message": "프로젝트를 찾을 수 없습니다."}), 404

    if ObjectId(current_user.get_id()) not in project.get("members", []):
        logger.error(f"User {current_user.get_id()} not a member of project {project_id}")
        return jsonify({"message": "권한이 없습니다."}), 403

    card = mongo.db.cards.find_one({"_id": card_oid, "project_id": oid})
    if not card:
        logger.error(f"Card not found: {card_id}")
        return jsonify({"message": "카드를 찾을 수 없습니다."}), 404

    comment = mongo.db.comments.find_one({"_id": comment_oid, "card_id": card_oid})
    if not comment:
        logger.error(f"Comment not found: {comment_id}")
        return jsonify({"message": "댓글을 찾을 수 없습니다."}), 404

    if str(comment["author_id"]) != current_user.get_id():
        logger.error(f"User {current_user.get_id()} not authorized to delete comment {comment_id}")
        return jsonify({"message": "댓글 삭제 권한이 없습니다."}), 403

    mongo.db.comments.delete_one({"_id": comment_oid})

    log_history(
        mongo,
        project_id,
        card_id,
        current_user.get_id(),
        "comment_delete",
        {"content": comment["content"], "title": card["title"]}
    )

    # 소켓 이벤트: 댓글 삭제
    socketio.emit('comment_deleted', {
        'project_id': project_id,
        'card_id': card_id,
        'comment_id': comment_id,
        'username': current_user.username,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    }, room=project_id)

    logger.info(f"Deleted comment {comment_id} for card {card_id} in project {project_id}")
    return jsonify({"message": "댓글이 삭제되었습니다."}), 200