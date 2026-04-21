document.addEventListener("DOMContentLoaded", async () => {
  const session = await requireSession();
  if (!session) return;

  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        //await fetch("http://localhost:3000/api/auth/logout", {
        await fetch("/api/auth/logout", {
          method: "POST"
        });
      } catch (error) {
        console.error("Logout failed:", error);
      }

      window.location.href = "index.html";
    });
  }
});