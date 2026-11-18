document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('dashboard-notifications');
    if (!container) return;

    try {
        const response = await fetch('/user/dashboard/notifications');
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.message || `Unable to load notifications (${response.status}).`);
        }
        if (!Array.isArray(result.notifications)) {
            throw new Error('The notification response was invalid.');
        }

        const activeNotifications = result.notifications.filter((notification) =>
            Number(notification.count) > 0
        );
        container.replaceChildren();

        if (activeNotifications.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'text-secondary mb-0 p-3';
            emptyMessage.textContent = 'Nothing needs your attention right now.';
            container.appendChild(emptyMessage);
            return;
        }

        activeNotifications.forEach((notification) => {
            const link = document.createElement('a');
            link.className = 'list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-3';
            link.href = notification.href;

            const details = document.createElement('span');
            details.className = 'me-auto';
            const label = document.createElement('span');
            label.className = 'd-block fw-semibold';
            label.textContent = notification.label;
            const description = document.createElement('small');
            description.className = 'd-block text-secondary';
            description.textContent = notification.description;
            details.append(label, description);

            const count = document.createElement('span');
            count.className = 'badge rounded-pill bg-warning-subtle text-warning-emphasis';
            count.textContent = notification.count;
            count.setAttribute('aria-label', `${notification.count} ${notification.label}`);

            link.append(details, count);
            container.appendChild(link);
        });
    } catch (error) {
        container.replaceChildren();
        const errorMessage = document.createElement('p');
        errorMessage.className = 'text-danger mb-0 p-3';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.textContent = error.message;
        container.appendChild(errorMessage);
    }
});
