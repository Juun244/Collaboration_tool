// 이메일 유효성 검사 함수
    function validateEmail(email) {
      const emailRegex = /^[\w\.-]+@[\w\.-]+\.\w+$/;
      return emailRegex.test(email);
    }

    // 비밀번호 유효성 검사 함수
    function validatePassword(password) {
      const minLength = password.length >= 8;
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      return minLength && hasSpecialChar;
    }

    // 비밀번호 확인 일치 여부 검사
    function validateConfirmPassword(password, confirmPassword) {
      return password === confirmPassword && confirmPassword !== "";
    }

    // 입력창 상태 업데이트
    function updateInputState(inputElement, feedbackElement, isValid, feedbackMessage) {
      if (isValid) {
        inputElement.classList.remove("is-invalid");
        inputElement.classList.add("is-valid");
        feedbackElement.style.display = "none";
      } else {
        inputElement.classList.remove("is-valid");
        inputElement.classList.add("is-invalid");
        feedbackElement.textContent = feedbackMessage;
        feedbackElement.style.display = "block";
      }
    }

    // 폼 요소
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirm_password");
    const usernameFeedback = document.getElementById("emailFeedback");
    const passwordFeedback = document.getElementById("passwordFeedback");
    const confirmPasswordFeedback = document.getElementById("confirmPasswordFeedback");
    const form = document.getElementById("registerForm");

    // 이메일 입력 시 실시간 검사
    emailInput.addEventListener("input", () => {
      const isValid = validateEmail(emailInput.value);
      updateInputState(
        emailInput,
        usernameFeedback,
        isValid,
        "유효한 이메일 주소를 입력하세요."
      );
    });

    // 비밀번호 입력 시 실시간 검사
    passwordInput.addEventListener("input", () => {
      const isValid = validatePassword(passwordInput.value);
      updateInputState(
        passwordInput,
        passwordFeedback,
        isValid,
        "비밀번호는 8자 이상이며, 특수문자를 포함해야 합니다."
      );
      // 비밀번호 확인도 같이 업데이트
      const confirmValid = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
      updateInputState(
        confirmPasswordInput,
        confirmPasswordFeedback,
        confirmValid,
        "비밀번호가 일치하지 않습니다."
      );
    });

    // 비밀번호 확인 입력 시 실시간 검사
    confirmPasswordInput.addEventListener("input", () => {
      const isValid = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);
      updateInputState(
        confirmPasswordInput,
        confirmPasswordFeedback,
        isValid,
        "비밀번호가 일치하지 않습니다."
      );
    });

    // 폼 제출 시 클라이언트 측 유효성 검사
    form.addEventListener("submit", (event) => {
      const isEmailValid = validateEmail(emailInput.value);
      const isPasswordValid = validatePassword(passwordInput.value);
      const isConfirmValid = validateConfirmPassword(passwordInput.value, confirmPasswordInput.value);

      if (!isEmailValid || !isPasswordValid || !isConfirmValid) {
        event.preventDefault();
        updateInputState(
          emailInput,
          usernameFeedback,
          isEmailValid,
          "유효한 이메일 주소를 입력하세요."
        );
        updateInputState(
          passwordInput,
          passwordFeedback,
          isPasswordValid,
          "비밀번호는 8자 이상이며, 특수문자를 포함해야 합니다."
        );
        updateInputState(
          confirmPasswordInput,
          confirmPasswordFeedback,
          isConfirmValid,
          "비밀번호가 일치하지 않습니다."
        );
      }
    });