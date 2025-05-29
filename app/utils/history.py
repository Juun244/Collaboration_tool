from bson import ObjectId
from datetime import datetime, timedelta
from pymongo.errors import PyMongoError
from .helpers import logger, safe_object_id

# 히스토리 기록
def log_history(mongo, project_id, card_id, user_id, action, details):
    try:
        mongo.db.history.insert_one({
            "project_id": safe_object_id(project_id),
            "card_id": safe_object_id(card_id),
            "user_id": ObjectId(user_id),
            "action": action,
            "details": details,
            "created_at": datetime.utcnow()
        })
        logger.info(f"Logged history: {action} for card {card_id} in project {project_id}")
    except PyMongoError as e:
        logger.error(f"Failed to log history: {str(e)}")

# 히스토리 조회
def get_project_history(mongo, project_id, user_id):
    oid = safe_object_id(project_id)
    if not oid:
        return None, {"message": "유효하지 않은 프로젝트 ID입니다."}, 400

    project = mongo.db.projects.find_one({"_id": oid, "members": ObjectId(user_id)})
    if not project:
        return None, {"message": "프로젝트를 찾을 수 없거나 권한이 없습니다."}, 404

    try:
        history = mongo.db.history.find({"project_id": oid}).sort("created_at", -1)
        history_list = []
        for entry in history:
            user = mongo.db.users.find_one({"_id": entry["user_id"]})

            created_local = entry["created_at"] + timedelta(hours=9)
            timestamp = created_local.strftime("%Y-%m-%d %H:%M:%S")

            history_list.append({
                "id": str(entry["_id"]),
                "user": user["username"] if user else "Unknown",
                "action": entry["action"],
                "details": entry["details"],
                "created_at": timestamp
            })
        return history_list, {"history": history_list}, 200
    except PyMongoError as e:
        logger.error(f"Failed to retrieve history: {str(e)}")
        return None, {"message": "히스토리 조회 중 오류가 발생했습니다."}, 500