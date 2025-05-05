from flask import Blueprint, render_template, request, redirect, url_for, session
from flask_login import login_user, logout_user, login_required, current_user
from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from app.utils.helpers import logger
from bson import ObjectId

auth_bp = Blueprint('auth', __name__)

def init_auth(app):
    global mongo, bcrypt
    mongo = PyMongo(app)
    bcrypt = Bcrypt(app)

@auth_bp.route("/")
def home():
    if current_user.is_authenticated:
        return redirect(url_for("auth.dashboard"))
    return redirect(url_for("auth.login"))

@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")

        if mongo.db.users.find_one({"username": username}):
            return "이미 존재하는 사용자입니다."

        mongo.db.users.insert_one({
            "username": username,
            "password": hashed_password,
            "invitations": []
        })
        return redirect(url_for("auth.login"))

    return render_template("register.html")

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        user_data = mongo.db.users.find_one({"username": username})

        if user_data and bcrypt.check_password_hash(user_data["password"], password):
            from app.__main__ import User
            user = User(user_data)
            login_user(user)
            session["user_id"] = user.id
            return redirect(url_for("auth.dashboard"))
        return "로그인 실패! 아이디 또는 비밀번호를 확인하세요."

    return render_template("login.html")

@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    session.pop("user_id", None)
    return redirect(url_for("auth.login"))

@auth_bp.route('/dashboard')
@login_required
def dashboard():
    user_data = mongo.db.users.find_one({"_id": ObjectId(current_user.id)})
    projects = mongo.db.projects.find({"members": ObjectId(current_user.id)}).sort("order", 1)

    project_list = []
    for project in projects:
        project["owner"] = str(project.get("owner", None))
        card_count = mongo.db.cards.count_documents({"project_id": project["_id"]})
        project["card_count"] = card_count
        project_list.append(project)

    return render_template(
        "dashboard.html",
        user={"_id": str(current_user.id), "username": current_user.username},
        projects=project_list
    )