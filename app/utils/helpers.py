import logging
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import PyMongoError

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def safe_object_id(oid):
    """ObjectId로 안전하게 변환"""
    try:
        return ObjectId(oid)
    except InvalidId:
        logger.error(f"Invalid ObjectId: {oid}")
        return None

def handle_db_error(e):
    """DB 에러 처리"""
    logger.error(f"Database error: {str(e)}")
    return {"message": "서버 오류가 발생했습니다.", "error": str(e)}, 500