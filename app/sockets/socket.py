# app/sockets/socket.py

from flask_socketio import SocketIO, emit, join_room, leave_room, Namespace
from flask_login import current_user
from flask import current_app

socketio = SocketIO(cors_allowed_origins="*")  # __main__.py에서 초기화용

class NotificationsNamespace(Namespace):
    def on_connect(self):
        if not current_user.is_authenticated:
            return False  # 비인증 사용자 연결 거부
        print(f"Client {current_user.get_id()} connected to /notifications")

    def on_disconnect(self):
        print(f"Client {current_user.get_id()} disconnected from /notifications")

    # 사용자 프로젝트 room 입장
    def on_join_project(self, data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        if not current_user.is_authenticated:
            emit('error', {'message': 'User not authenticated'})
            return
        
        try:
            join_room(project_id)
            print(f"User {current_user.get_id()} joined project room {project_id}")
            # 멤버 수 계산 (예: DB 쿼리로 실제 구현 필요)
            member_count = self.get_member_count(project_id)
            emit('user_joined', {
                'user_id': current_user.get_id(),
                'project_id': project_id,
                'member_count': member_count
            }, room=project_id)
        except Exception as e:
            emit('error', {'message': f'Failed to join project: {str(e)}'})
            current_app.logger.error(f"Join project error: {str(e)}")

    # 카드 생성
    def on_card_created(self, data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        try:
            print(f"Card created in project {project_id}: {data}")
            emit('card_created', data, room=project_id)
        except Exception as e:
            emit('error', {'message': f'Failed to create card: {str(e)}'})
            current_app.logger.error(f"Card creation error: {str(e)}")

    # 카드 수정
    def on_card_updated(self, data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        try:
            print(f"Card updated in project {project_id}: {data}")
            emit('card_updated', data, room=project_id)
        except Exception as e:
            emit('error', {'message': f'Failed to update card: {str(e)}'})
            current_app.logger.error(f"Card update error: {str(e)}")

    # 카드 삭제
    def on_card_deleted(self, data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        try:
            print(f"Card deleted in project {project_id}: {data}")
            emit('card_deleted', data, room=project_id)
        except Exception as e:
            emit('error', {'message': f'Failed to delete card: {str(e)}'})
            current_app.logger.error(f"Card deletion error: {str(e)}")

    # 카드 이동
    def on_card_moved(self, data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        try:
            print(f"Card moved in project {project_id}: {data}")
            emit('card_moved', data, room=project_id)
        except Exception as e:
            emit('error', {'message': f'Failed to move card: {str(e)}'})
            current_app.logger.error(f"Card move error: {str(e)}")

    # 프로젝트 나가기
    def on_leave_project(self, data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        if not current_user.is_authenticated:
            emit('error', {'message': 'User not authenticated'})
            return
        
        try:
            leave_room(project_id)
            print(f"User {current_user.get_id()} left project room {project_id}")
            # 멤버 수 계산 (예: DB 쿼리로 실제 구현 필요)
            member_count = self.get_member_count(project_id)
            emit('user_left', {
                'user_id': current_user.get_id(),
                'project_id': project_id,
                'member_count': member_count
            }, room=project_id)
        except Exception as e:
            emit('error', {'message': f'Failed to leave project: {str(e)}'})
            current_app.logger.error(f"Leave project error: {str(e)}")

    def get_member_count(self, project_id):
        # TODO: 실제 DB에서 프로젝트 멤버 수를 조회하는 로직 구현
        # 예: return Project.query.get(project_id).members.count()
        return 0  # Placeholder

# 네임스페이스 등록
socketio.on_namespace(NotificationsNamespace('/notifications'))