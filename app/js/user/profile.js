const passwordForm = document.getElementById('passwordForm');
const passwordMessage = document.getElementById('passwordMessage');
const passwordModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('passwordModal'));
const profileMessage = document.getElementById('profileMessage');

const request = async (url, body) => {
    const options = body === undefined
        ? { method: 'POST' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        };
    return fetch(url, options);
};

const readError = async (response, fallback) => {
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
        return fallback;
    }
    const result = await response.json();
    return result.message || fallback;
};

const showProfileMessage = (message, type = 'success') => {
    profileMessage.className = `alert alert-${type} mb-4`;
    profileMessage.textContent = message;
};

const showActionError = (messageElement, message) => {
    if (messageElement === profileMessage) {
        showProfileMessage(message, 'danger');
        return;
    }
    messageElement.textContent = message;
};

const endSession = async (url, messageElement) => {
    try {
        const response = await request(url);
        if (!response.ok) {
            const message = await readError(response, 'Unable to complete the request. Please try again.');
            showActionError(messageElement, message);
            return;
        }
        window.location.assign('/user/login');
    } catch (error) {
        console.error('Unable to complete account action:', error);
        showActionError(messageElement, 'Unable to connect. Please try again.');
    }
};

const loadProfile = async () => {
    try {
        const response = await fetch('/user/profile/details');
        if (!response.ok) {
            window.location.assign('/user/login');
            return;
        }

        const { profile } = await response.json();
        document.getElementById('profileName').textContent = profile.name || '—';
        document.getElementById('profileEmail').textContent = profile.email;
        document.getElementById('profileRole').textContent = profile.role;
    } catch (error) {
        console.error('Unable to load profile:', error);
        showProfileMessage('Unable to load your profile. Refresh the page to try again.', 'danger');
    }
};

passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    passwordMessage.textContent = '';

    const currentPassword = passwordForm.elements.currentPassword.value;
    const newPassword = passwordForm.elements.newPassword.value;
    const confirmPassword = passwordForm.elements.confirmPassword.value;

    if (newPassword !== confirmPassword) {
        passwordMessage.textContent = 'The new passwords do not match.';
        return;
    }

    const saveButton = document.getElementById('savePasswordButton');
    saveButton.disabled = true;
    try {
        const response = await request('/user/profile/password', {
            currentPassword,
            newPassword,
            confirmPassword,
        });
        if (!response.ok) {
            passwordMessage.textContent = await readError(response, 'Unable to update your password.');
            return;
        }

        passwordForm.reset();
        passwordModal.hide();
        showProfileMessage('Your password has been updated.');
    } catch (error) {
        console.error('Unable to update password:', error);
        passwordMessage.textContent = 'Unable to connect. Please try again.';
    } finally {
        saveButton.disabled = false;
    }
});

document.getElementById('passwordModal').addEventListener('hidden.bs.modal', () => {
    passwordForm.reset();
    passwordMessage.textContent = '';
});

document.getElementById('logoutButton').addEventListener('click', () => {
    profileMessage.className = 'alert d-none mb-4';
    profileMessage.textContent = '';
    endSession('/user/logout', profileMessage);
});

document.getElementById('confirmDeactivateButton').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const message = document.getElementById('deactivateMessage');
    const password = document.getElementById('deactivatePassword').value;
    message.textContent = '';
    if (!password) {
        message.textContent = 'Enter your current password to continue.';
        return;
    }

    button.disabled = true;
    try {
        const response = await request('/user/profile/deactivate', { currentPassword: password });
        if (!response.ok) {
            message.textContent = await readError(response, 'Unable to deactivate your account.');
            return;
        }
        window.location.assign('/user/login');
    } catch (error) {
        console.error('Unable to deactivate account:', error);
        message.textContent = 'Unable to connect. Please try again.';
    } finally {
        button.disabled = false;
    }
});

document.getElementById('deactivateModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('deactivateMessage').textContent = '';
    document.getElementById('deactivatePassword').value = '';
});

loadProfile();
