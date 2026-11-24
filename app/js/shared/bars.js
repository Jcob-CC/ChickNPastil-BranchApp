let currentSessionUser = null;
window.getCurrentUser = () => currentSessionUser;

// SQLite stores timestamps in UTC without a zone ("YYYY-MM-DD HH:MM:SS"); display them in Philippine time.
window.APP_TIME_ZONE = "Asia/Manila";
window.parseDbDate = (value) => {
  if (!value) return new Date(NaN);
  const text = String(value).trim().replace(" ", "T");
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);
};
// Menu image paths are saved without a host (e.g. "assets/sales/img/menu/elite.jpg"); serve them from the site root.
// A product with no photo, or whose photo file is missing, shows the business logo.
window.PRODUCT_LOGO_URL = "/assets/sales/img/logo.png";
window.productImageUrl = (path) => {
  const value = String(path || "").trim();
  if (!value) return window.PRODUCT_LOGO_URL;
  return encodeURI(/^(https?:)?\/\//i.test(value) || value.startsWith("/") ? value : `/${value}`);
};
window.productImageTag = (path, className) =>
  `<img class="${className}" src="${window.productImageUrl(path)}" alt="" loading="lazy" onerror="this.onerror=null;this.src=PRODUCT_LOGO_URL">`;
window.formatDbDate =(value, options = {}, method = "toLocaleString") => {
  const date = value instanceof Date ? value : window.parseDbDate(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date[method]("en-PH", { ...options, timeZone: window.APP_TIME_ZONE });
};

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
        const normalizedRole = (role || "").trim().toLowerCase();
        const isStaffRole = ["staff", "vendor", "cashier"].includes(normalizedRole);
        const isManagerRole = ["admin", "manager"].includes(normalizedRole);
        document.querySelectorAll('[class*="role-"]').forEach((element) => {
          const allowedRoles = Array.from(element.classList)
            .filter((className) => className.startsWith("role-"))
            .map((className) => className.slice("role-".length).toLowerCase());

          if (allowedRoles.length === 0) return;

          const navItem = element.matches(".nav-link") && element.closest("li");
          let hasAccess = false;
          if (allowedRoles.includes(normalizedRole)) {
            hasAccess = true;
          } else if (isStaffRole && (allowedRoles.includes("staff") || allowedRoles.includes("vendor"))) {
            hasAccess = true;
          } else if (isManagerRole && (allowedRoles.includes("admin") || allowedRoles.includes("manager"))) {
            hasAccess = true;
          }

          (navItem || element).hidden = !hasAccess;
        });
      };

      const getRoleLabel = (role) => {
        const normalizedRole = (role || "").trim().toLowerCase();
        const labels = {
          admin: "Admin",
          manager: "Manager",
          supervisor: "Supervisor",
          "service-crew": "Service Crew",
        };
        return labels[normalizedRole] ||
          `${normalizedRole.charAt(0).toUpperCase()}${normalizedRole.slice(1)}`;
      };

      applyRoleVisibility(null);

      fetch("/user/session")
        .then((response) => {
          if (!response.ok) throw new Error("Failed to load session details");
          return response.json();
        })
        .then((session) => {
          currentSessionUser = {
            name: `${session.firstName || ""} ${session.lastName || ""}`.trim(),
            role: getRoleLabel(session.role),
            branch: session.branchLocationName,
            email: session.email,
          };
          const userName = document.getElementById("topbar-user-name");
          const userRole = document.getElementById("topbar-user-role");
          const branchLocation = document.getElementById("branch-location-name");

          if (userName) {
            userName.textContent = `${session.firstName} ${session.lastName}`.trim();
          }
          if (userRole) {
            userRole.textContent = getRoleLabel(session.role);
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
          // Sales pages' stylesheet opens the mobile sidebar via this body class
          document.body.classList.toggle("mobile-sidebar-open", !isCollapsed);
        });
      }
    })
    .catch((err) => console.error("Error loading component layout:", err));
});