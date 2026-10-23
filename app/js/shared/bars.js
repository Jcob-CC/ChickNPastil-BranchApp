document.addEventListener("DOMContentLoaded", function () {
  // 1. Fetch reusable components from bars.html
  fetch("../../assets/html/bars.html")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load bars.html");
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

      // 2. Initialize sidebar dropdown links
      const sidebarNav = sidebarEl && sidebarEl.querySelector(".sidebar-nav");
      if (sidebarNav) {
        sidebarNav.querySelectorAll(".nav-item").forEach((navItem) => {
          const submenu = Array.from(navItem.children).find((child) =>
            child.classList.contains("subnav")
          );
          const navLink = Array.from(navItem.children).find((child) =>
            child.classList.contains("nav-link")
          );

          if (submenu && navLink) {
            navItem.classList.add("has-subnav");
            navLink.setAttribute("aria-expanded", "false");
            navLink.setAttribute("aria-controls", submenu.id);
          }
        });

        sidebarNav.addEventListener("click", function (event) {
          if (!(event.target instanceof Element)) return;

          const navLink = event.target.closest(".nav-link");
          const navItem = navLink && navLink.parentElement;
          const submenu =
            navItem &&
            Array.from(navItem.children).find((child) =>
              child.classList.contains("subnav")
            );

          if (!submenu) return;

          event.preventDefault();
          const isOpen = navItem.classList.toggle("is-open");
          submenu.hidden = !isOpen;
          navLink.setAttribute("aria-expanded", String(isOpen));
        });
      }

      // 3. Set Page Title Header based on current HTML data attribute or <title>
      const customTitle = document.body.getAttribute("data-page-header");
      const titleHeading = document.getElementById("page-title-heading");
      if (titleHeading && customTitle) {
        titleHeading.textContent = customTitle;
      }

      const applyRoleVisibility = (role) => {
        document.querySelectorAll('[class*="role-"]').forEach((element) => {
          const allowedRoles = Array.from(element.classList)
            .filter((className) => className.startsWith("role-"))
            .map((className) => className.slice("role-".length));

          if (allowedRoles.length === 0) return;

          const navItem = element.matches(".nav-link") && element.closest("li");
          (navItem || element).hidden = !allowedRoles.includes(role);
        });
      };

      applyRoleVisibility(null);

      fetch("/user/session")
        .then((response) => {
          if (!response.ok) throw new Error("Failed to load session details");
          return response.json();
        })
        .then((session) => {
          const userName = document.getElementById("topbar-user-name");
          const userRole = document.getElementById("topbar-user-role");
          const branchLocation = document.getElementById("branch-location-name");

          if (userName) {
            userName.textContent = `${session.firstName} ${session.lastName}`.trim();
          }
          if (userRole) {
            userRole.textContent =
              session.role.charAt(0).toUpperCase() + session.role.slice(1);
          }
          if (branchLocation) {
            branchLocation.textContent = session.branchLocationName;
          }
          applyRoleVisibility(session.role);
        })
        .catch((err) => console.error("Error loading session details:", err));

      // 4. Initialize Sidebar Toggle Functionality
      const sidebarToggleBtn = document.getElementById("sidebar-toggle");
      const sidebar = document.getElementById("app-sidebar");

      if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener("click", function () {
          const isCollapsed = sidebar.classList.toggle("collapsed");
          sidebarToggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
        });
      }
    })
    .catch((err) => console.error("Error loading component layout:", err));
});