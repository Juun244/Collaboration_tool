from flask_socketio import join_room, leave_room, emit
from flask_login import current_user
from flask import request
from datetime import datetime
from bson.objectid import ObjectId
from app import mongo  # ✅ PyMongo 인스턴스 import


def register_chat_events(socketio):
    @socketio.on("join")
    def handle_join(data):
        project_id = str(data.get("project_id"))
        sid = request.sid
        if not current_user.is_authenticated:
            emit("notice", {"msg": "인증되지 않은 사용자입니다."}, to=sid)
            return

        join_room(project_id, sid=sid)

        # ✅ 이전 메시지 불러오기
        messages = list(
            mongo.db.chat_messages.find({"project_id": project_id})
            .sort("timestamp", -1)
            .limit(50)
        )[::-1]  # 최근 메시지 50개 가져와서 시간순 정렬

        history = []
        for msg in messages:
            history.append({
                "user_id": msg.get("user_id", ""),  # ✅ 과거 메시지도 id 포함 (없을 수 있으니 기본값 제공)
                "username": msg["username"],
                "message": msg["message"],
                "timestamp": msg["timestamp"].strftime("%H:%M:%S")
            })

        emit("chat_history", history, to=sid)
        emit("notice", {"msg": f"{current_user.username}님이 입장하셨습니다."}, room=project_id)

    @socketio.on("leave")
    def handle_leave(data):
        project_id = str(data.get("project_id"))
        sid = request.sid

        print(f"👋 {current_user.username}가 방 {project_id}에서 퇴장함")

        emit("notice", {"msg": f"{current_user.username}님이 퇴장하셨습니다."}, room=project_id, include_self=True)

        leave_room(project_id, sid=sid)

    @socketio.on("send_message")
    def handle_send_message(data):
        project_id = str(data.get("project_id"))
        message = data.get("message")
        if not message or not project_id:
            return

        timestamp = datetime.now()
        user_id = str(current_user.get_id())

        # ✅ 메시지 저장 (user_id 포함)
        mongo.db.chat_messages.insert_one({
            "project_id": project_id,
            "user_id": user_id,
            "username": current_user.username,
            "message": message,
            "timestamp": timestamp
        })

        # ✅ 메시지 송신 (user_id 포함)
        emit("message", {
            "user_id": user_id,
            "username": current_user.username,
            "message": message,
            "timestamp": timestamp.strftime("%H:%M:%S")
        }, room=project_id)

    @socketio.on("disconnect")
    def handle_disconnect():
        print(f"🔌 {current_user.username if current_user.is_authenticated else '익명'} 연결 종료됨")
