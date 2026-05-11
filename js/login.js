const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      errorBox.textContent = data.error || t("login_failed", "Login failed");
      return;
    }

    // Login page language is temporary only.
    // After login, home.html should use the logged-in user's preferred language.
    window.clearStoredLanguage?.();
    window.setStoredLanguageUserId?.(null);

    // bootstrap langauge before redirecting to home
    const preferredLang =
      data.session?.profile?.preferred_language ||
      data.profile?.preferred_language ||
      data.user?.preferred_language ||
      null;

    window.clearStoredLanguage?.();
    window.setStoredLanguageUserId?.(null);

    if (preferredLang) {
      localStorage.setItem("caal_ui_language_bootstrap", preferredLang);
    }

    window.location.href = "home.html";
  } catch (err) {
    errorBox.textContent = t("server_error", "Server error");
    console.error(err);
  }
});