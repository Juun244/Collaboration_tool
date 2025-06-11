# socket.py
from flask import request
from flask_socketio import emit, join_room, leave_room
from flask_login import current_user, login_required
from datetime import datetime
from bson.objectid import ObjectId
from app import mongo
from app.utils.history import log_history
import os
import logging

logger = logging.getLogger(__name__)

def register_socket_events(socketio):
    # 타임스탬프를 가져오는 헬퍼 함수
    def get_timestamp():
        return datetime.utcnow().isoformat() + "Z" # ISO 8601 형식 (UTC)

    # 'join' 이벤트 핸들러
    @socketio.on('join')
    @login_required
    def handle_join(data):
        project_id = data
        sid = request.sid
        if not current_user.is_authenticated:
            emit('notice', {'msg': '인증되지 않은 사용자입니다.', 'project_id': project_id}, to=sid)
            return

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=sid)
            return

        if ObjectId(current_user.get_id()) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=sid)
            return

        join_room(project_id)
        # 메시지 기록 DB에서 불러오기
        messages = mongo.db.chat_messages.find({"project_id": project_id}).sort("timestamp", 1)
        history = []
        for msg in messages:
            history.append({
                "project_id": project_id,
                "nickname": msg.get("nickname"),
                "message": msg.get("message"),
                "timestamp": msg.get("timestamp").strftime("%Y-%m-%d %H:%M")
            })
        
        emit("chat_history", history, room=current_user.nickname)  # 특정 사용자에게만 전송

        emit("notice", {
            "project_id": project_id,
            "msg": f"{current_user.nickname}님이 입장하였습니다."
        }, room=project_id)

    # 'leave' 이벤트 핸들러
    @socketio.on('leave')
    @login_required
    def handle_leave(data):
        project_id = str(data.get('project_id'))
        sid = request.sid
        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=sid)
            return

        if ObjectId(current_user.get_id()) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=sid)
            return

        emit('notice', {'msg': f'{current_user.nickname}님이 퇴장하셨습니다.', 'project_id': project_id}, room=project_id, include_self=True)
        leave_room(project_id, sid=sid)

    # 'send_message' 이벤트 핸들러
    @socketio.on('send_message')
    @login_required
    def handle_send_message(data):
        project_id = str(data.get('project_id'))
        message = data.get('message')
        if not message or not project_id:
            emit('notice', {'msg': '메시지 또는 프로젝트 ID가 필요합니다.', 'project_id': project_id}, to=request.sid)
            return

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(current_user.get_id()) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        user_id = str(current_user.get_id())
        timestamp = datetime.now()
        mongo.db.chat_messages.insert_one({
            'project_id': project_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'message': message,
            'timestamp': timestamp
        })

        emit('message', {
            'user_id': user_id,
            'project_id': project_id,
            'nickname': current_user.nickname,
            'message': message,
            'timestamp': timestamp.strftime('%H:%M:%S')
        }, room=project_id)

    # 'disconnect' 이벤트 핸들러
    @socketio.on('disconnect')
    def handle_disconnect():
        print(f'🔌 {current_user.nickname if current_user.is_authenticated else "익명"} 연결 종료됨')

    # 'project_created' 이벤트 핸들러
    @socketio.on('project_created')
    @login_required
    def handle_project_created(data):
        project_id = str(data.get('project_id'))
        name = data.get('name')
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if str(project.get('owner')) != user_id:
            emit('notice', {'msg': '프로젝트 생성 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=user_id,
            nickname= current_user.nickname,
            action='create',
            details={
                'project_name': name,
                'nickname': current_user.nickname
            }
        )

        emit('project_created', {
            'project_id': project_id,
            'name': name,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    @socketio.on('project_updated')
    @login_required
    def handle_project_updated(data):
        project_id = data.get('project_id')
        action = data.get('action')  # "삭제" 또는 "나가기"
        user_nickname = current_user.nickname
        user_id = str(current_user.get_id())

        if not project_id or not action:
            return

        if action == "삭제":
            # 삭제된 프로젝트는 DB에서 사라졌으므로, 이전 members 리스트를 직접 찾아야 함
            deleted_project = mongo.db.projects.find_one({"_id": ObjectId(project_id)})
            if deleted_project:
                member_ids = deleted_project.get("members", [])
            else:
                # 캐싱 또는 이전 정보를 이용해야 하지만 예외적으로 owner 외엔 수신할 수 없음
                member_ids = []
        else:
            # 나가기일 경우 현재 멤버 정보 조회
            project = mongo.db.projects.find_one({"_id": ObjectId(project_id)})
            if not project:
                return
            member_ids = project.get("members", [])

        for member_id in member_ids:
            user = mongo.db.users.find_one({"_id": member_id})
            if user:
                emit("project_updated", {
                    "project_id": project_id,
                    "action": action,
                    "user_nickname": user_nickname,
                    "user_id": user_id
                }, room=user["nickname"])
                print(f"aaaaa!!@@@{user['nickname']}")

        print(f"📢 project_updated 이벤트: {action} by {user_nickname} for {project_id}")


    # 'invite_project' 이벤트 핸들러
    @socketio.on('invite_project')
    @login_required
    def handle_invite_project(data):
        project_id = str(data.get('project_id'))
        invitee_nickname = data.get('invitee_nickname')
        inviter_id = str(current_user.get_id())
        timestamp = get_timestamp()
        print(f"Handling invite_project: project_id={project_id}, invitee_nickname={invitee_nickname}, inviter_nickname={current_user.nickname}")

        # 프로젝트 및 사용자 검증
        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=current_user.nickname, include_self=True)
            return

        if ObjectId(inviter_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=current_user.nickname, include_self=True)
            return

        invitee = mongo.db.users.find_one({'nickname': invitee_nickname})
        if not invitee:
            emit('notice', {'msg': '사용자를 찾을 수 없습니다.', 'invitee_nickname': invitee_nickname}, to=current_user.nickname, include_self=True)
            return

        if ObjectId(invitee['_id']) in project.get('members', []):
            emit('notice', {'msg': '이미 프로젝트 멤버입니다.', 'invitee_nickname': invitee_nickname}, to=current_user.nickname, include_self=True)
            return

        # 초대 정보 DB에 저장
        mongo.db.users.update_one(
            {'_id': invitee['_id']},
            {'$push': {'invitations': ObjectId(project_id)}}
        )

        # 초대 이벤트 전송
        emit('invite_project', {
            'project_id': project_id,
            'inviter_id': inviter_id,
            'inviter_nickname': current_user.nickname,
            'invitee_nickname': invitee_nickname,
            'timestamp': timestamp
        }, room=invitee_nickname)
        print(f"Sending project_invite to room {invitee_nickname}: {{project_id: {project_id}, invitee: {invitee_nickname}}}")

        # 프로젝트 멤버들에게 알림 전송
        for member in project.get('members', []):
            member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
            if member_nickname and str(member) != inviter_id:  # 초대한 사람을 제외한 멤버들에게만 알림
                notification_message = f'[{project["name"]}] {current_user.nickname}님이 {invitee_nickname}님을 프로젝트에 초대했습니다.'
                notification_data = {
                    'user_id': member,
                    'message': notification_message,
                    'type': 'project_invite',
                    'timestamp': datetime.utcnow().isoformat()
                }
                mongo.db.notifications.insert_one(notification_data)
                emit('notification', {
                    'message': notification_message,
                    'type': 'project_invite',
                    'project_id': project_id,
                    'project_name': project['name'],
                    'author_name': current_user.nickname,
                    'timestamp': datetime.utcnow().isoformat() # ISO 8601 형식으로 전송
                }, room=member_nickname)

    # 'respond_invite' 이벤트 핸들러
    @socketio.on('respond_invite')
    @login_required
    def handle_respond_invite(data):
        project_id = str(data.get('project_id'))
        accepted = data.get('accepted')
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        mongo.db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$pull': {'invitations': ObjectId(project_id)}}
        )

        if accepted:
            # 프로젝트 멤버로 추가
            mongo.db.projects.update_one(
                {'_id': ObjectId(project_id)},
                {'$addToSet': {'members': ObjectId(user_id)}}
            )
            log_history(
                mongo=mongo,
                project_id=project_id,
                card_id=None,
                user_id=user_id,
                nickname= current_user.nickname,
                action='join',
                details={
                    'project_name': project['name'],
                    'nickname': current_user.nickname
                }
            )

            # 프로젝트 룸에 조인
            join_room(project_id)
            print(f"User {current_user.nickname} joined project room: {project_id}")

        # 초대 수락한 본인만 받게
        message = "초대를 수락했습니다." if accepted else "초대를 거절했습니다."
        emit('invite_response', {
            'project_id': project_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'accepted': accepted,
            'message': message,
            'timestamp': timestamp
        }, to=current_user.nickname)

        # 나머지 기존 프로젝트 멤버에게만 알림
        emit('invite_response', {
            'project_id': project_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'accepted': accepted,
            'timestamp': timestamp
        }, room= project_id, include_self=False)


    # 'create_card' 이벤트 핸들러
    @socketio.on('create_card')
    @login_required
    def handle_create_card(data):
        project_id = str(data.get('project_id'))
        card = data.get('card')
        user_id = str(current_user.get_id())
        if not card or not project_id:
            print("Invalid data received for create_card")
            return

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})

        # 프로젝트 멤버들에게 알림 전송
        for member in project.get('members', []):
            member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
            if member_nickname and str(member) != user_id:  # 자신을 제외한 멤버들에게만 알림
                notification_message = f'[{project["name"]}] {current_user.nickname}님이 새로운 카드를 생성했습니다: {card.get("title")}'
                notification_data = {
                    'user_id': member,
                    'message': notification_message,
                    'type': 'card_created',
                    'timestamp': datetime.utcnow(),
                    'read': False,
                    'project_id': ObjectId(project_id),
                    'card_id': card.get('_id')
                }
                mongo.db.notifications.insert_one(notification_data)
                emit('notification', {
                    'message': notification_message,
                    'type': 'card_created',
                    'timestamp': datetime.utcnow().isoformat()
                }, room=member_nickname)
                emit('card_created', {
                'project_id': project_id,
                'card': card,
                'user_id': str(current_user.get_id()),
                'nickname': current_user.nickname,
                'timestamp': datetime.utcnow().isoformat()
                },room=member_nickname)

    # 'delete_card' 이벤트 핸들러
    @socketio.on('delete_card')
    @login_required
    def handle_delete_card(data):
        project_id = str(data.get('project_id'))
        card_id = str(data.get('card_id'))
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(user_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        card = mongo.db.cards.find_one({'_id': ObjectId(card_id), 'project_id': ObjectId(project_id)})
        if not card:
            emit('notice', {'msg': '카드를 찾을 수 없습니다.', 'card_id': card_id}, to=request.sid)
            return

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            nickname= current_user.nickname,
            action='card_delete',
            details={'title': card['title']}
        )

        # 프로젝트 멤버들에게 알림 전송
        for member in project.get('members', []):
            member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
            if member_nickname and str(member) != user_id:  # 자신을 제외한 멤버들에게만 알림
                notification_message = f'[{project["name"]}] {current_user.nickname}님이 카드를 삭제했습니다: {card["title"]}'
                notification_data = {
                    'user_id': member,
                    'message': notification_message,
                    'type': 'card_deleted',
                    'timestamp': datetime.utcnow(),
                    'read': False,
                    'project_id': ObjectId(project_id),
                    'card_id': ObjectId(card_id)
                }
                mongo.db.notifications.insert_one(notification_data)
                emit('notification', {
                    'message': notification_message,
                    'type': 'card_deleted',
                    'timestamp': datetime.utcnow().isoformat()
                }, room=member_nickname)

        mongo.db.cards.delete_one({'_id': ObjectId(card_id)})
        emit('card_deleted', {
            'project_id': project_id,
            'card_id': card_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 'update_card' 이벤트 핸들러
    @socketio.on('update_card')
    @login_required
    def handle_update_card(data):
        project_id = str(data.get('project_id'))
        card_id = str(data.get('card_id'))
        updates = data.get('updates', {})
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(user_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        card = mongo.db.cards.find_one({'_id': ObjectId(card_id), 'project_id': ObjectId(project_id)})
        if not card:
            emit('notice', {'msg': '카드를 찾을 수 없습니다.', 'card_id': card_id}, to=request.sid)
            return

        update_data = {
            'title': updates.get('title', card['title']),
            'description': updates.get('description', card['description']),
            'status': updates.get('status', card['status'])
        }

        changes = {}
        if card['title'] != update_data['title']:
            changes['title'] = {'from': card['title'], 'to': update_data['title']}
        if card['description'] != update_data['description']:
            changes['description'] = {'from': card['description'], 'to': update_data['description']}
        if card['status'] != update_data['status']:
            changes['status'] = {'from': card['status'], 'to': update_data['status']}
            log_history(
                mongo=mongo,
                project_id=project_id,
                card_id=card_id,
                user_id=user_id,
                nickname= current_user.nickname,
                action='card_status_update',
                details={
                    'from_status': card['status'],
                    'to_status': update_data['status'],
                    'title': card['title']
                }
            )

        if changes:
            log_history(
                mongo=mongo,
                project_id=project_id,
                card_id=card_id,
                user_id=user_id,
                nickname= current_user.nickname,
                action='card_update',
                details=changes
            )

            # 프로젝트 멤버들에게 알림 전송
            for member in project.get('members', []):
                member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
                if member_nickname and str(member) != user_id:  # 자신을 제외한 멤버들에게만 알림
                    change_messages = []
                    if 'title' in changes:
                        change_messages.append(f'제목: {changes["title"]["from"]} → {changes["title"]["to"]}')
                    if 'status' in changes:
                        status_map = {'todo': 'To Do', 'in_progress': 'In Progress', 'done': 'Done'}
                        from_status = status_map.get(changes['status']['from'], changes['status']['from'])
                        to_status = status_map.get(changes['status']['to'], changes['status']['to'])
                        change_messages.append(f'상태: {from_status} → {to_status}')
                    
                    notification_message = f'[{project["name"]}] {current_user.nickname}님이 카드를 수정했습니다: {card["title"]}\n변경사항: {", ".join(change_messages)}'
                    notification_data = {
                        'user_id': member,
                        'message': notification_message,
                        'type': 'card_updated',
                        'timestamp': datetime.utcnow(),
                        'read': False,
                        'project_id': ObjectId(project_id),
                        'card_id': ObjectId(card_id)
                    }
                    mongo.db.notifications.insert_one(notification_data)
                    emit('notification', {
                        'message': notification_message,
                        'type': 'card_updated',
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=member_nickname)

        mongo.db.cards.update_one(
            {'_id': ObjectId(card_id)},
            {'$set': update_data}
        )

        emit('card_updated', {
            'project_id': project_id,
            'card_id': card_id,
            'updates': update_data,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 마감일 업데이트 이벤트
    @socketio.on('set_project_deadline')
    @login_required
    def handle_set_project_deadline(data):
        print(f"set_project_deadline 이벤트 수신: {data}")
        project_id = str(data.get('project_id'))
        deadline = data.get('deadline')
        user_id = str(data.get('user_id'))
        nickname = data.get('nickname')
        timestamp = get_timestamp()

        try:
            project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
            if not project:
                print(f"프로젝트 찾을 수 없음: {project_id}")
                emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
                return

            if ObjectId(user_id) not in project.get('members', []):
                print(f"사용자 {user_id}는 프로젝트 {project_id}의 멤버가 아님")
                emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
                return

            if deadline:
                try:
                    datetime.strptime(deadline, '%Y-%m-%d')
                except ValueError:
                    print(f"유효하지 않은 날짜 형식: {deadline}")
                    emit('notice', {'msg': '유효하지 않은 날짜 형식입니다.', 'project_id': project_id}, to=request.sid)
                    return

            emit('set_project_deadline', {
                'project_id': project_id,
                'deadline': deadline,
                'user_id': user_id,
                'nickname': nickname,
                'timestamp': timestamp
            }, room=project_id)

            print(f"set_project_deadline 이벤트 전송: project_id={project_id}, deadline={deadline}")
        except Exception as e:
            print(f"set_project_deadline 처리 중 오류: {str(e)}")
            emit('notice', {
                'msg': '마감일 알림 처리 중 오류가 발생했습니다.',
                'error': str(e),
                'project_id': project_id
            }, to=request.sid)


    # 댓글 생성 이벤트 처리
    @socketio.on('add_comment')
    @login_required
    def handle_add_comment(data):
        print(f"add_comment 이벤트 수신: {data}")
        project_id = str(data.get('project_id'))
        comment_id = str(data.get('comment_id'))
        content = data.get('content')
        user_id = str(data.get('author_id'))
        nickname = data.get('author_name')
        image_url = data.get('image_url') or None
        timestamp = get_timestamp()

        try:
            project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
            if not project:
                print(f"프로젝트 찾을 수 없음: {project_id}")
                emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
                return

            if ObjectId(user_id) not in project.get('members', []):
                print(f"사용자 {user_id}는 프로젝트 {project_id}의 멤버가 아님")
                emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
                return

            emit('create_comment', {
                'project_id': project_id,
                'comment': {
                    'id': comment_id,
                    'content': content,
                    'user_id': user_id,
                    'nickname': nickname,
                    'image_url': image_url,
                    'timestamp': timestamp
                }
            }, room=project_id)

            members = project.get('members', [])
            print(f"{len(members)}명의 멤버에게 알림 전송")
            for member in members:
                member_data = mongo.db.users.find_one({'_id': member})
                if not member_data:
                    print(f"멤버 ID {member}에 대한 사용자 정보 없음")
                    continue
                member_nickname = member_data.get('nickname')
                if member_nickname and str(member) != user_id:
                    print(f"멤버 {member_nickname}에게 알림 전송")
                    notification_message = f'[{project["name"]}] {nickname}님이 새로운 댓글을 달았습니다.'
                    notification_data = {
                        'user_id': member,
                        'message': notification_message,
                        'type': 'new_comment',
                        'timestamp': datetime.utcnow(),
                        'read': False,
                        'project_id': ObjectId(project_id),
                        'comment_id': comment_id
                    }
                    mongo.db.notifications.insert_one(notification_data)
                    emit('notification', {
                        'message': notification_message,
                        'type': 'new_comment',
                        'project_id': project_id,
                        'project_name': project['name'],
                        'author_name': nickname,
                        'timestamp': datetime.utcnow().isoformat()
                    }, room=member_nickname)

        except Exception as e:
            print(f"add_comment 처리 중 오류: {str(e)}")
            emit('notice', {'msg': '댓글 알림 처리 중 오류가 발생했습니다.', 'error': str(e)}, to=request.sid)

    # 댓글 수정 이벤트 처리
    @socketio.on('edit_comment')
    @login_required
    def handle_edit_comment(data):
        print(f"edit_comment 이벤트 수신: {data}")
        project_id = str(data.get('project_id'))  # 프로젝트 ID
        comment_id = str(data.get('comment_id'))  # 댓글 ID
        content = data.get('content')  # 댓글 내용
        image_url = data.get('image_url') or None  # 이미지 URL (선택적)
        delete_image = data.get('delete_image') == '1'  # 이미지 삭제 여부
        user_id = str(data.get('author_id'))  # 작성자 ID
        nickname = data.get('author_name')  # 작성자 닉네임
        timestamp = get_timestamp()  # 타임스탬프 생성

        # comment_edited 이벤트 브로드캐스트
        emit('comment_edited', {
            'project_id': project_id,
            'comment': {
                'id': comment_id,
                'content': content,
                'image_url': image_url,
                'delete_image': delete_image,
                'user_id': user_id,
                'nickname': nickname,
                'timestamp': timestamp
            }
        }, room=project_id)

    # 댓글 삭제 이벤트 처리
    @socketio.on('delete_comment')
    @login_required
    def handle_delete_comment(data):
        print(f"delete_comment 이벤트 처리 시작: data={data}, socket_id={request.sid}")
        
        project_id = str(data.get('project_id'))  # 프로젝트 ID
        comment_id = str(data.get('comment_id'))  # 댓글 ID
        user_id = str(current_user.get_id())  # 작성자 ID

        # comment_deleted 이벤트 브로드캐스트
        print(f"comment_deleted 이벤트 전송: room={project_id}, data={{project_id: {project_id}, comment_id: {comment_id}}}")
        emit('comment_deleted', {
            'project_id': project_id,
            'comment_id': comment_id
        }, room=project_id)


    @socketio.on("join_dashboard")
    def handle_join(data):
        nickname = data.get("nickname")
        if nickname:
            join_room(nickname)
            print(f"{nickname} joined room: {nickname}")

    @socketio.on("card_moved")
    def broadcast_card_moved(data):
        source_project_id = data.get("source_project_id")
        target_project_id = data.get("target_project_id")
        emit("card_moved", data, room= source_project_id)
        if source_project_id != target_project_id:
            emit("card_moved", data, room= target_project_id)

    @socketio.on('project_invitation')
    @login_required
    def handle_project_invitation(data):
        project_id = data.get('project_id')
        invited_user_id = data.get('invited_user_id')

        if not project_id or not invited_user_id:
            logger.error("Missing project_id or invited_user_id for project_invitation")
            return

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id), 'members': ObjectId(current_user.get_id())})
        if not project:
            logger.warning(f"User {current_user.get_id()} not authorized to invite to project {project_id}")
            emit('notice', {'msg': '초대 권한이 없습니다.'}, to=request.sid)
            return

        invited_user = mongo.db.users.find_one({'_id': ObjectId(invited_user_id)})
        if not invited_user:
            logger.warning(f"Invited user {invited_user_id} not found")
            emit('notice', {'msg': '초대할 사용자를 찾을 수 없습니다.'}, to=request.sid)
            return

        if ObjectId(invited_user_id) in project.get('members', []):
            logger.info(f"User {invited_user_id} is already a member of project {project_id}")
            emit('notice', {'msg': '이미 프로젝트 멤버입니다.'}, to=request.sid)
            return

        # 초대 알림을 데이터베이스에 저장
        notification_message = f'프로젝트 "{project["name"]}"에 초대되었습니다.'
        notification_data = {
            'user_id': ObjectId(invited_user_id),
            'message': notification_message,
            'type': 'project_invited',
            'timestamp': datetime.utcnow(),
            'read': False,
            'project_id': ObjectId(project_id)
        }
        mongo.db.notifications.insert_one(notification_data)

        # 초대된 사용자에게 실시간 알림 전송
        emit('notification', {
            'message': notification_message,
            'type': 'project_invited',
            'project_id': project_id,
            'project_name': project['name'],
            'timestamp': datetime.utcnow().isoformat()
        }, room=invited_user['nickname'])

        logger.info(f"Invitation sent to {invited_user['nickname']} for project {project['name']}")
        emit('notice', {'msg': f'{invited_user["nickname"]}님을 초대했습니다.'}, to=request.sid)

    @socketio.on('mark_notification_as_read')
    @login_required
    def handle_mark_notification_as_read(data):
        notification_id = data.get('notification_id')
        user_id = ObjectId(current_user.get_id())

        if not notification_id:
            logger.error("Missing notification_id for mark_notification_as_read")
            return

        result = mongo.db.notifications.update_one(
            {'_id': ObjectId(notification_id), 'user_id': user_id},
            {'$set': {'read': True}}
        )

        if result.modified_count > 0:
            logger.info(f"Notification {notification_id} marked as read for user {user_id}")
            emit('notification_read', {'notification_id': notification_id}, to=request.sid)
        else:
            logger.warning(f"Notification {notification_id} not found or not owned by user {user_id}")

    @socketio.on('mark_all_notifications_as_read')
    @login_required
    def handle_mark_all_notifications_as_read():
        user_id = ObjectId(current_user.get_id())

        result = mongo.db.notifications.update_many(
            {'user_id': user_id, 'read': False},
            {'$set': {'read': True}}
        )

        if result.modified_count > 0:
            logger.info(f"{result.modified_count} notifications marked as read for user {user_id}")
            emit('all_notifications_read', {}, to=request.sid)
        else:
            logger.info(f"No unread notifications to mark as read for user {user_id}")

    @socketio.on('get_notifications')
    @login_required
    def handle_get_notifications():
        user_id = ObjectId(current_user.get_id())
        notifications = list(mongo.db.notifications.find({'user_id': user_id}).sort('timestamp', -1).limit(50))
        
        notifications_list = []
        for notif in notifications:
            notifications_list.append({
                'id': str(notif['_id']),
                'message': notif['message'],
                'type': notif['type'],
                'timestamp': notif['timestamp'].isoformat(),
                'read': notif['read'],
                'project_id': str(notif['project_id']) if 'project_id' in notif else None,
                'card_id': str(notif['card_id']) if 'card_id' in notif else None,
                'comment_id': str(notif['comment_id']) if 'comment_id' in notif else None
            })
        emit('notifications_loaded', {'notifications': notifications_list}, to=request.sid)

    @socketio.on('delete_notification')
    @login_required
    def handle_delete_notification(data):
        notification_id = data.get('notification_id')
        user_id = ObjectId(current_user.get_id())

        if not notification_id:
            logger.error("Missing notification_id for delete_notification")
            return

        # 알림이 해당 사용자의 것인지 확인하고 삭제
        result = mongo.db.notifications.delete_one({
            '_id': ObjectId(notification_id),
            'user_id': user_id
        })

        if result.deleted_count > 0:
            logger.info(f"Notification {notification_id} deleted for user {user_id}")
            emit('notification_deleted', {
                'notification_id': notification_id,
                'success': True
            }, to=request.sid)
        else:
            logger.warning(f"Notification {notification_id} not found or not owned by user {user_id}")
            emit('notification_deleted', {
                'notification_id': notification_id,
                'success': False,
                'message': '알림을 찾을 수 없거나 삭제 권한이 없습니다.'
            }, to=request.sid)