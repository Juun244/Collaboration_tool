console.log("common_darkmode.js loaded!");

document.addEventListener('DOMContentLoaded', function() {
  console.log("DOMContentLoaded 이벤트 fired");
  if (localStorage.getItem('darkMode') === 'on') {
    document.body.classList.add('dark-mode');
    console.log("dark-mode 클래스 붙임");
  } else {
    document.body.classList.remove('dark-mode');
    console.log("dark-mode 클래스 뗌");
  }
});

window.addEventListener('storage', function(e) {
  if (e.key === 'darkMode') {
    if (e.newValue === 'on') {
      document.body.classList.add('dark-mode');
      console.log("storage 이벤트: dark-mode 클래스 붙임");
    } else {
      document.body.classList.remove('dark-mode');
      console.log("storage 이벤트: dark-mode 클래스 뗌");
    }
  }
});
