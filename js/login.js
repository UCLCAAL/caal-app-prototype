const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    //const res = await fetch(`${API_BASE}/api/auth/login`, {
      //const res = await fetch("http://localhost:3000/api/auth/login", {
      const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      errorBox.textContent = data.error || "Login failed";
      return;
    }

    // redirect to home
    window.location.href = "home.html";

  } catch (err) {
    errorBox.textContent = "Server error";
    console.error(err);
  }
});