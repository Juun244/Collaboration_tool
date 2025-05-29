# socket.py
from flask import session
from flask_socketio import emit, join_room, leave_room
from datetime import datetime
from flask_login import current_user, login_required # flask_login 임포트

def register_socket_events(socketio, mongo):
    # UTC 타임스탬프를 가져오는 헬퍼 함수
    def get_utc_timestamp():
        return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

    # 'join' 이벤트 핸들러
    @socketio.on('join')
    @login_required 
    def on_join(data):
        project_id = data.get('project_id')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        join_room(project_id)
        emit('notice', {'project_id': project_id, 'msg': f'{username}님이 채팅방에 입장했습니다'}, room=project_id)
        chat_history = list(mongo.db.chat_messages.find({"project_id": project_id}))
        emit('chat_history', [
            {
                'project_id': str(msg['project_id']),
                'username': msg['username'],
                'message': msg['message'],
                'timestamp': msg['timestamp']
            } for msg in chat_history
        ])

    # 'leave' 이벤트 핸들러
    @socketio.on('leave')
    @login_required
    def on_leave(data):
        project_id = data.get('project_id')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        leave_room(project_id)
        emit('notice', {'project_id': project_id, 'msg': f'{username}님이 채팅방을 나갔습니다'}, room=project_id)

    # 'send_message' 이벤트 핸들러
    @socketio.on('send_message')
    @login_required
    def on_message(data):
        project_id = data.get('project_id')
        message = data.get('message')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        mongo.db.chat_messages.insert_one({
            'project_id': project_id,
            'username': username,
            'message': message,
            'timestamp': timestamp
        })
        emit('message', {
            'project_id': project_id,
            'username': username,
            'message': message,
            'timestamp': timestamp
        }, room=project_id)

    # 'disconnect' 이벤트 핸들러
    @socketio.on('disconnect')
    def on_disconnect():
        username = session.get('username', 'Guest') 

    # 'project_created' 이벤트 핸들러
    @socketio.on('project_created')
    @login_required
    def on_project_created(data):
        project_id = data.get('project_id')
        name = data.get('name')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('project_created', {
            'project_id': project_id,
            'name': name,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'project_deleted' 이벤트 핸들러
    @socketio.on('project_deleted')
    @login_required
    def on_project_deleted(data):
        project_id = data.get('project_id')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('project_deleted', {
            'project_id': project_id,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'invite_project' 이벤트 핸들러
    @socketio.on('invite_project')
    @login_required
    def on_invite_project(data):
        project_id = data.get('project_id')
        invitee_username = data.get('invitee_username')
        inviter = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('project_invite', {
            'project_id': project_id,
            'inviter': inviter,
            'invitee_username': invitee_username,
            'timestamp': timestamp
        }, room=invitee_username)

    # 'respond_invite' 이벤트 핸들러
    @socketio.on('respond_invite')
    @login_required
    def on_respond_invite(data):
        project_id = data.get('project_id')
        accepted = data.get('accepted')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('invite_response', {
            'project_id': project_id,
            'username': username,
            'accepted': accepted,
            'timestamp': timestamp
        }, room=project_id)

    # 'create_card' 이벤트 핸들러
    @socketio.on('create_card')
    @login_required
    def on_create_card(data):
        project_id = data.get('project_id')
        card_title = data.get('card_title')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('card_created', {
            'project_id': project_id,
            'card_title': card_title,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'delete_card' 이벤트 핸들러
    @socketio.on('delete_card')
    @login_required
    def on_delete_card(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('card_deleted', {
            'project_id': project_id,
            'card_id': card_id,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'update_card' 이벤트 핸들러
    @socketio.on('update_card')
    @login_required
    def on_update_card(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        updates = data.get('updates')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('card_updated', {
            'project_id': project_id,
            'card_id': card_id,
            'updates': updates,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'set_due_date' 이벤트 핸들러
    @socketio.on('set_due_date')
    @login_required
    def on_set_due_date(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        due_date = data.get('due_date')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('due_date_set', {
            'project_id': project_id,
            'card_id': card_id,
            'due_date': due_date,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'update_due_date' 이벤트 핸들러
    @socketio.on('update_due_date')
    @login_required
    def on_update_due_date(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        new_due_date = data.get('new_due_date')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('due_date_updated', {
            'project_id': project_id,
            'card_id': card_id,
            'new_due_date': new_due_date,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'create_comment' 이벤트 핸들러
    @socketio.on('create_comment')
    @login_required
    def on_create_comment(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        comment = data.get('comment')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('comment_created', {
            'project_id': project_id,
            'card_id': card_id,
            'comment': comment,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'delete_comment' 이벤트 핸들러
    @socketio.on('delete_comment')
    @login_required
    def on_delete_comment(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        comment_id = data.get('comment_id')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('comment_deleted', {
            'project_id': project_id,
            'card_id': card_id,
            'comment_id': comment_id,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)

    # 'update_comment' 이벤트 핸들러
    @socketio.on('update_comment')
    @login_required
    def on_update_comment(data):
        project_id = data.get('project_id')
        card_id = data.get('card_id')
        comment_id = data.get('comment_id')
        new_comment = data.get('new_comment')
        username = current_user.username if current_user.is_authenticated else 'Guest'
        timestamp = get_utc_timestamp()
        emit('comment_updated', {
            'project_id': project_id,
            'card_id': card_id,
            'comment_id': comment_id,
            'new_comment': new_comment,
            'username': username,
            'timestamp': timestamp
        }, room=project_id)