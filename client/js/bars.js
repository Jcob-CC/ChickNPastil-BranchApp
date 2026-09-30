document.addEventListener("DOMContentLoaded", function () {
  // 1. Fetch reusable components from components.html
  fetch("../../assets/html/components.html")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load components.html");
      return response.text();
    })
    .then((html) => {
      // Create a temporary element to parse components
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      const topbarEl = doc.querySelector(".topbar");
      const sidebarEl = doc.querySelector(".sidebar");

      // Inject topbar and sidebar into placeholders
      const topbarContainer = document.getElementById("topbar-wrapper");
      const sidebarContainer = document.getElementById("sidebar-wrapper");

      if (topbarContainer && topbarEl) topbarContainer.appendChild(topbarEl);
      if (sidebarContainer && sidebarEl) sidebarContainer.appendChild(sidebarEl);

      // 2. Set Page Title Header based on current HTML data attribute or <title>
      const customTitle = document.body.getAttribute("data-page-header");
      const titleHeading = document.getElementById("page-title-heading");
      if (titleHeading && customTitle) {
        titleHeading.textContent = customTitle;
      }

      // 3. Initialize Sidebar Toggle Functionality
      const sidebarToggleBtn = document.getElementById("sidebar-toggle");
      const sidebar = document.getElementById("app-sidebar");

      if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener("click", function () {
          sidebar.classList.toggle("collapsed");
        });
      }
    })
    .catch((err) => console.error("Error loading component layout:", err));
});