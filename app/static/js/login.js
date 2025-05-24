function addRememberParam(link) {
    const rememberCheckbox = document.getElementById('remember');
    if (rememberCheckbox.checked) {
      const url = new URL(link.href);
      url.searchParams.set('remember', '1');
      link.href = url.toString();
    }
    return true;
  }