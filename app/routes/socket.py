# socket.py
from flask import request
from flask_socketio import emit, join_room, leave_room
from flask_login import current_user, login_required
from datetime import datetime
from bson.objectid import ObjectId
from app import mongo
from app.utils.history import log_history
import os

def register_socket_events(socketio):
    # 타임스탬프를 가져오는 헬퍼 함수
    def get_timestamp():
        return datetime.now().strftime('%H:%M:%S')

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

        # 초대받은 사용자에게 알림 전송
        emit('notification', {
            'message': f'[{project["name"]}] {current_user.nickname}님이 프로젝트에 초대했습니다.',
            'type': 'project_invite',
            'timestamp': datetime.utcnow().isoformat()
        }, room=invitee_nickname)

        # 프로젝트 멤버들에게 알림 전송
        for member in project.get('members', []):
            member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
            if member_nickname and str(member) != inviter_id:  # 초대한 사람을 제외한 멤버들에게만 알림
                emit('notification', {
                    'message': f'[{project["name"]}] {current_user.nickname}님이 {invitee_nickname}님을 프로젝트에 초대했습니다.',
                    'type': 'project_invite',
                    'timestamp': datetime.utcnow().isoformat()
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
        card_title = data.get('card_title')
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(user_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if not card_title:
            emit('notice', {'msg': '카드 제목이 필요합니다.', 'project_id': project_id}, to=request.sid)
            return

        max_order_doc = mongo.db.cards.find({'project_id': ObjectId(project_id)}).sort('order', -1).limit(1)
        max_order_doc = next(max_order_doc, None)
        max_order = max_order_doc['order'] + 1 if max_order_doc else 0

        new_card = {
            'project_id': ObjectId(project_id),
            'title': card_title,
            'description': data.get('description', ''),
            'created_by': ObjectId(user_id),
            'created_at': datetime.utcnow(),
            'status': data.get('status', 'todo'),
            'order': max_order
        }

        result = mongo.db.cards.insert_one(new_card)
        card_id = str(result.inserted_id)

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            nickname= current_user.nickname,
            action='card_create',
            details={
                'title': card_title,
                'status': new_card['status']
            }
        )

        # 프로젝트 멤버들에게 알림 전송
        for member in project.get('members', []):
            member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
            if member_nickname and str(member) != user_id:  # 자신을 제외한 멤버들에게만 알림
                emit('notification', {
                    'message': f'[{project["name"]}] {current_user.nickname}님이 새로운 카드를 생성했습니다: {card_title}',
                    'type': 'card_created',
                    'timestamp': datetime.utcnow().isoformat()
                }, room=member_nickname)

        emit('card_created', {
            'project_id': project_id,
            'card_id': card_id,
            'card_title': card_title,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

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
                emit('notification', {
                    'message': f'[{project["name"]}] {current_user.nickname}님이 카드를 삭제했습니다: {card["title"]}',
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
                    
                    emit('notification', {
                        'message': f'[{project["name"]}] {current_user.nickname}님이 카드를 수정했습니다: {card["title"]}\n변경사항: {", ".join(change_messages)}',
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

    # 'set_due_date' 이벤트 핸들러
    @socketio.on('set_due_date')
    @login_required
    def handle_set_due_date(data):
        project_id = str(data.get('project_id'))
        card_id = str(data.get('card_id'))
        due_date = data.get('due_date')
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

        try:
            due_date_dt = datetime.strptime(due_date, '%Y-%m-%d')
        except ValueError:
            emit('notice', {'msg': '유효하지 않은 날짜 형식입니다.', 'card_id': card_id}, to=request.sid)
            return

        mongo.db.cards.update_one(
            {'_id': ObjectId(card_id)},
            {'$set': {'due_date': due_date_dt}}
        )

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            nickname= current_user.nickname,
            action='card_due_date_set',
            details={
                'title': card['title'],
                'due_date': due_date
            }
        )

        emit('due_date_set', {
            'project_id': project_id,
            'card_id': card_id,
            'due_date': due_date,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 'update_due_date' 이벤트 핸들러
    @socketio.on('update_due_date')
    @login_required
    def handle_update_due_date(data):
        project_id = str(data.get('project_id'))
        card_id = str(data.get('card_id'))
        new_due_date = data.get('new_due_date')
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

        try:
            new_due_date_dt = datetime.strptime(new_due_date, '%Y-%m-%d')
        except ValueError:
            emit('notice', {'msg': '유효하지 않은 날짜 형식입니다.', 'card_id': card_id}, to=request.sid)
            return

        old_due_date = card.get('due_date')
        mongo.db.cards.update_one(
            {'_id': ObjectId(card_id)},
            {'$set': {'due_date': new_due_date_dt}}
        )

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            nickname= current_user.nickname,
            action='card_due_date_update',
            details={
                'title': card['title'],
                'old_due_date': old_due_date.strftime('%Y-%m-%d') if old_due_date else None,
                'new_due_date': new_due_date
            }
        )

        emit('due_date_updated', {
            'project_id': project_id,
            'card_id': card_id,
            'new_due_date': new_due_date,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 'create_comment' 이벤트 핸들러
    @socketio.on('create_comment')
    @login_required
    def handle_create_comment(data):
        print(f"Received create_comment event: {data}")
        project_id = str(data.get('project_id'))
        content = data.get('content')
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        print(f"Processing comment creation: project_id={project_id}, user_id={user_id}")

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            print(f"Project not found: {project_id}")
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(user_id) not in project.get('members', []):
            print(f"User {user_id} is not a member of project {project_id}")
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if not content:
            print("Comment content is empty")
            emit('notice', {'msg': '댓글 내용이 필요합니다.'}, to=request.sid)
            return

        new_comment = {
            'project_id': ObjectId(project_id),
            'author_id': ObjectId(user_id),
            'author_name': current_user.nickname,
            'content': content,
            'created_at': datetime.utcnow()
        }

        result = mongo.db.comments.insert_one(new_comment)
        comment_id = str(result.inserted_id)
        print(f"Comment created with ID: {comment_id}")

        # 프로젝트 멤버들에게 알림 전송
        members = project.get('members', [])
        print(f"Sending notifications to {len(members)} members")
        
        for member in members:
            member_nickname = mongo.db.users.find_one({'_id': member}).get('nickname')
            if member_nickname and str(member) != user_id:  # 자신을 제외한 멤버들에게만 알림
                print(f"Sending notification to member: {member_nickname}")
                emit('notification', {
                    'message': f'[{project["name"]}] {current_user.nickname}님이 새로운 댓글을 달았습니다.',
                    'type': 'new_comment',
                    'project_id': project_id,
                    'project_name': project['name'],
                    'author_name': current_user.nickname,
                    'timestamp': datetime.utcnow().isoformat() # ISO 8601 형식으로 전송
                }, room=member_nickname)

        # 댓글 생성 이벤트 전송
        emit('comment_created', {
            'project_id': project_id,
            'comment_id': comment_id,
            'content': content,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 'delete_comment' 이벤트 핸들러
    @socketio.on('delete_comment')
    @login_required
    def handle_delete_comment(data):
        project_id = str(data.get('project_id'))
        comment_id = str(data.get('comment_id'))
        card_id = str(data.get('card_id')) if data.get('card_id') else None
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(user_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        # 댓글 쿼리 조건 설정
        comment_query = {'_id': ObjectId(comment_id), 'project_id': ObjectId(project_id)}
        if card_id:
            comment_query['card_id'] = ObjectId(card_id)

        comment = mongo.db.comments.find_one(comment_query)
        if not comment:
            emit('notice', {'msg': '댓글을 찾을 수 없습니다.', 'comment_id': comment_id}, to=request.sid)
            return

        if str(comment['author_id']) != user_id:
            emit('notice', {'msg': '댓글 삭제 권한이 없습니다.', 'comment_id': comment_id}, to=request.sid)
            return

        if comment.get('image_filename'):
            file_path = os.path.join(current_app.static_folder, 'uploads', comment['image_filename'])
            if os.path.exists(file_path):
                os.remove(file_path)

        mongo.db.comments.delete_one({'_id': ObjectId(comment_id)})

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            nickname= current_user.nickname,
            action='comment_delete',
            details={
                'content': comment['content'],
                'project_name': project['name']
            }
        )

        emit('comment_deleted', {
            'project_id': project_id,
            'comment_id': comment_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 'update_comment' 이벤트 핸들러
    @socketio.on('update_comment')
    @login_required
    def handle_update_comment(data):
        project_id = str(data.get('project_id'))
        comment_id = str(data.get('comment_id'))
        card_id = str(data.get('card_id')) if data.get('card_id') else None
        new_content = data.get('new_content')
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(user_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        # 댓글 쿼리 조건 설정
        comment_query = {'_id': ObjectId(comment_id), 'project_id': ObjectId(project_id)}
        if card_id:
            comment_query['card_id'] = ObjectId(card_id)

        comment = mongo.db.comments.find_one(comment_query)
        if not comment:
            emit('notice', {'msg': '댓글을 찾을 수 없습니다.', 'comment_id': comment_id}, to=request.sid)
            return

        if str(comment['author_id']) != user_id:
            emit('notice', {'msg': '댓글 수정 권한이 없습니다.', 'comment_id': comment_id}, to=request.sid)
            return

        if not new_content:
            emit('notice', {'msg': '댓글 내용이 필요합니다.', 'comment_id': comment_id}, to=request.sid)
            return

        mongo.db.comments.update_one(
            {'_id': ObjectId(comment_id)},
            {'$set': {'content': new_content}}
        )

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            nickname= current_user.nickname,
            action='comment_update',
            details={
                'old_content': comment['content'],
                'new_content': new_content,
                'project_name': project['name']
            }
        )

        emit('comment_updated', {
            'project_id': project_id,
            'comment_id': comment_id,
            'content': new_content,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
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