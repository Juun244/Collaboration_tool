# socket.py
from flask import request
from flask_socketio import emit, join_room, leave_room
from flask_login import current_user, login_required
from datetime import datetime
from bson.objectid import ObjectId
from app import mongo
from app.utils.history import log_history

def register_socket_events(socketio):
    # 타임스탬프를 가져오는 헬퍼 함수
    def get_timestamp():
        return datetime.now().strftime('%H:%M:%S')

    # 'join' 이벤트 핸들러
    @socketio.on('join')
    @login_required
    def handle_join(data):
        project_id = str(data.get('project_id'))
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

        join_room(project_id, sid=sid)
        messages = list(
            mongo.db.chat_messages.find({'project_id': project_id})
            .sort('timestamp', -1)
            .limit(50)
        )[::-1]

        history = [
            {
                'user_id': msg.get('user_id', ''),
                'project_id': project_id,
                'nickname': msg.get('nickname', '알수없음'),
                'message': msg['message'],
                'timestamp': msg['timestamp'].strftime('%H:%M:%S')
            } for msg in messages
        ]

        emit('chat_history', history, to=sid)
        emit('notice', {'msg': f'{current_user.nickname}님이 입장하셨습니다.', 'project_id': project_id}, room=project_id)

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

    # 'project_deleted' 이벤트 핸들러
    @socketio.on('project_deleted')
    @login_required
    def handle_project_deleted(data):
        project_id = str(data.get('project_id'))
        user_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if str(project.get('owner')) != user_id:
            emit('notice', {'msg': '프로젝트 삭제 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=None,
            user_id=user_id,
            action='delete',
            details={
                'project_name': project['name'],
                'nickname': current_user.nickname
            }
        )

        emit('project_deleted', {
            'project_id': project_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)

    # 'invite_project' 이벤트 핸들러
    @socketio.on('invite_project')
    @login_required
    def handle_invite_project(data):
        project_id = str(data.get('project_id'))
        invitee_nickname = data.get('invitee_nickname')
        inviter_id = str(current_user.get_id())
        timestamp = get_timestamp()

        project = mongo.db.projects.find_one({'_id': ObjectId(project_id)})
        if not project:
            emit('notice', {'msg': '프로젝트를 찾을 수 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        if ObjectId(inviter_id) not in project.get('members', []):
            emit('notice', {'msg': '프로젝트에 대한 권한이 없습니다.', 'project_id': project_id}, to=request.sid)
            return

        invitee = mongo.db.users.find_one({'nickname': invitee_nickname})
        if not invitee:
            emit('notice', {'msg': '사용자를 찾을 수 없습니다.', 'invitee_nickname': invitee_nickname}, to=request.sid)
            return

        if ObjectId(invitee['_id']) in project.get('members', []):
            emit('notice', {'msg': '이미 프로젝트 멤버입니다.', 'invitee_nickname': invitee_nickname}, to=request.sid)
            return

        if ObjectId(project_id) in invitee.get('invitations', []):
            emit('notice', {'msg': '이미 초대된 사용자입니다.', 'invitee_nickname': invitee_nickname}, to=request.sid)
            return

        mongo.db.users.update_one(
            {'_id': invitee['_id']},
            {'$push': {'invitations': ObjectId(project_id)}}
        )

        emit('project_invite', {
            'project_id': project_id,
            'inviter_id': inviter_id,
            'inviter_nickname': current_user.nickname,
            'invitee_nickname': invitee_nickname,
            'timestamp': timestamp
        }, room=str(invitee['_id']))

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
            mongo.db.projects.update_one(
                {'_id': ObjectId(project_id)},
                {'$addToSet': {'members': ObjectId(user_id)}}
            )
            log_history(
                mongo=mongo,
                project_id=project_id,
                card_id=None,
                user_id=user_id,
                action='join',
                details={
                    'project_name': project['name'],
                    'nickname': current_user.nickname
                }
            )

        emit('invite_response', {
            'project_id': project_id,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'accepted': accepted,
            'timestamp': timestamp
        }, room=project_id)

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
            action='card_create',
            details={
                'title': card_title,
                'status': new_card['status']
            }
        )

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
            action='card_delete',
            details={'title': card['title']}
        )

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
                action='card_update',
                details=changes
            )

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
        project_id = str(data.get('project_id'))
        card_id = str(data.get('card_id'))
        content = data.get('content')
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

        if not content:
            emit('notice', {'msg': '댓글 내용이 필요합니다.', 'card_id': card_id}, to=request.sid)
            return

        new_comment = {
            'project_id': ObjectId(project_id),
            'card_id': ObjectId(card_id),
            'author_id': ObjectId(user_id),
            'author_name': current_user.nickname,
            'content': content,
            'created_at': datetime.utcnow()
        }

        result = mongo.db.comments.insert_one(new_comment)
        comment_id = str(result.inserted_id)

        log_history(
            mongo=mongo,
            project_id=project_id,
            card_id=card_id,
            user_id=user_id,
            action='comment_create',
            details={
                'content': content,
                'card_title': card['title']
            }
        )

        emit('comment_created', {
            'project_id': project_id,
            'card_id': card_id,
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
        card_id = str(data.get('card_id'))
        comment_id = str(data.get('comment_id'))
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

        comment = mongo.db.comments.find_one({'_id': ObjectId(comment_id), 'card_id': ObjectId(card_id)})
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
            action='comment_delete',
            details={
                'content': comment['content'],
                'card_title': card['title']
            }
        )

        emit('comment_deleted', {
            'project_id': project_id,
            'card_id': card_id,
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
        card_id = str(data.get('card_id'))
        comment_id = str(data.get('comment_id'))
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

        card = mongo.db.cards.find_one({'_id': ObjectId(card_id), 'project_id': ObjectId(project_id)})
        if not card:
            emit('notice', {'msg': '카드를 찾을 수 없습니다.', 'card_id': card_id}, to=request.sid)
            return

        comment = mongo.db.comments.find_one({'_id': ObjectId(comment_id), 'card_id': ObjectId(card_id)})
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
            action='comment_update',
            details={
                'old_content': comment['content'],
                'new_content': new_content,
                'card_title': card['title']
            }
        )

        emit('comment_updated', {
            'project_id': project_id,
            'card_id': card_id,
            'comment_id': comment_id,
            'new_content': new_content,
            'user_id': user_id,
            'nickname': current_user.nickname,
            'timestamp': timestamp
        }, room=project_id)