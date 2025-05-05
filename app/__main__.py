from flask import Flask
from flask_pymongo import PyMongo
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from dotenv import load_dotenv
import os
from app.routes.auth import auth_bp, init_auth
from app.routes.projects import projects_bp, init_projects
from app.routes.cards import cards_bp, init_cards

# 환경 변수 로드
load_dotenv()

app = Flask(__name__)
app.config["MONGO_URI"] = f"mongodb://{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.secret_key = os.getenv('SECRET_KEY')

# MongoDB 초기화
mongo = PyMongo(app)

# Bcrypt 초기화
bcrypt = Bcrypt(app)

# 로그인 매니저 초기화
login_manager = LoginManager()
login_manager.init_app(app)

# User 클래스 정의
class User:
    def __init__(self, user_data):
        self.id = str(user_data["_id"])
        self.username = user_data["username"]
        self.invitations = user_data.get("invitations", [])

    def get_id(self):
        return self.id

    @property
    def is_active(self):
        return True

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

@login_manager.user_loader
def load_user(user_id):
    from bson import ObjectId
    user_data = mongo.db.users.find_one({"_id": ObjectId(user_id)})
    return User(user_data) if user_data else None

# Blueprint 등록 및 초기화
init_auth(app)
init_projects(app)
init_cards(app)
app.register_blueprint(auth_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(cards_bp)

if __name__ == "__main__":
    app.run(debug=True)