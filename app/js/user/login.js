const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginSubmitButton = loginForm.querySelector('button[type="submit"]');
const verificationInput = document.getElementById('verificationCode');
const verificationMessage = document.getElementById('verificationMessage');
const branchChoices = document.getElementById('branchChoices');
const branchMessage = document.getElementById('branchMessage');
const confirmedBranch = document.getElementById('confirmedBranch');
const confirmationModalElement = document.getElementById('branchConfirmationModal');

const verificationModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById('verificationCodeModal'),
);
const branchModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById('branchLocationModal'),
);
const confirmationModal = bootstrap.Modal.getOrCreateInstance(
    confirmationModalElement,
);

let selectedBranch;
let isCheckingPassword = false;

const passwordRecoveryModalElement = document.getElementById('passwordRecoveryModal');
const passwordRecoveryModal = bootstrap.Modal.getOrCreateInstance(passwordRecoveryModalElement);
const passwordRecoveryRequestForm = document.getElementById('passwordRecoveryRequestForm');
const passwordRecoveryVerifyForm = document.getElementById('passwordRecoveryVerifyForm');
const passwordRecoveryCompleteForm = document.getElementById('passwordRecoveryCompleteForm');
const passwordRecoverySuccess = document.getElementById('passwordRecoverySuccess');
const recoveryEmail = document.getElementById('recoveryEmail');
const recoveryCode = document.getElementById('recoveryCode');
const recoveryRequestMessage = document.getElementById('recoveryRequestMessage');
const recoveryVerifyMessage = document.getElementById('recoveryVerifyMessage');
const recoveryCompleteMessage = document.getElementById('recoveryCompleteMessage');
let isRecoveringPassword = false;

const accountApplicationModalElement = document.getElementById('accountApplicationModal');
const accountApplicationModal = bootstrap.Modal.getOrCreateInstance(accountApplicationModalElement);
const accountApplicationForm = document.getElementById('accountApplicationForm');
const accountApplicationMessage = document.getElementById('accountApplicationMessage');
const accountApplicationSuccess = document.getElementById('accountApplicationSuccess');
let isApplyingForAccount = false;

document.getElementById('applyForAccountButton').addEventListener('click', () => {
    accountApplicationModal.show();
});

accountApplicationModalElement.addEventListener('hidden.bs.modal', () => {
    accountApplicationForm.reset();
    accountApplicationForm.hidden = false;
    accountApplicationSuccess.hidden = true;
    accountApplicationMessage.textContent = '';
});

accountApplicationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isApplyingForAccount) return;

    isApplyingForAccount = true;
    const submitButton = accountApplicationForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    accountApplicationMessage.textContent = '';

    try {
        const response = await fetch('/user/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                first_name: accountApplicationForm.elements.firstName.value,
                last_name: accountApplicationForm.elements.lastName.value,
                email: accountApplicationForm.elements.email.value,
                password: accountApplicationForm.elements.password.value,
                confirmPassword: accountApplicationForm.elements.confirmPassword.value,
            }),
        });

        if (!response.ok) {
            const result = await response.json();
            accountApplicationMessage.textContent = result.message || 'Unable to submit your application right now. Please try again.';
            return;
        }

        accountApplicationForm.hidden = true;
        accountApplicationSuccess.hidden = false;
    } catch {
        accountApplicationMessage.textContent = 'Unable to submit your application right now. Please try again.';
    } finally {
        isApplyingForAccount = false;
        submitButton.disabled = false;
    }
});

document.getElementById('forgotPasswordButton').addEventListener('click', () => {
    recoveryEmail.value = loginForm.elements.email.value.trim();
    passwordRecoveryModal.show();
});

passwordRecoveryModalElement.addEventListener('hidden.bs.modal', () => {
    passwordRecoveryRequestForm.reset();
    passwordRecoveryVerifyForm.reset();
    passwordRecoveryCompleteForm.reset();
    passwordRecoveryRequestForm.hidden = false;
    passwordRecoveryVerifyForm.hidden = true;
    passwordRecoveryCompleteForm.hidden = true;
    passwordRecoverySuccess.hidden = true;
    recoveryRequestMessage.textContent = '';
    recoveryVerifyMessage.textContent = '';
    recoveryCompleteMessage.textContent = '';
});

passwordRecoveryRequestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isRecoveringPassword) return;

    isRecoveringPassword = true;
    const submitButton = passwordRecoveryRequestForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    recoveryRequestMessage.textContent = '';

    try {
        const response = await fetch('/user/password-reset/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: recoveryEmail.value }),
        });

        if (!response.ok) {
            recoveryRequestMessage.textContent = response.status === 400
                ? 'Enter a valid email address.'
                : 'Unable to send a verification code right now. Please try again.';
            return;
        }

        passwordRecoveryRequestForm.hidden = true;
        passwordRecoveryVerifyForm.hidden = false;
        recoveryCode.focus();
    } catch {
        recoveryRequestMessage.textContent = 'Unable to send a verification code right now. Please try again.';
    } finally {
        isRecoveringPassword = false;
        submitButton.disabled = false;
    }
});

passwordRecoveryVerifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isRecoveringPassword) return;

    isRecoveringPassword = true;
    const submitButton = passwordRecoveryVerifyForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    recoveryVerifyMessage.textContent = '';

    try {
        const response = await fetch('/user/password-reset/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: recoveryCode.value }),
        });

        if (!response.ok) {
            recoveryVerifyMessage.textContent = response.status === 429
                ? 'Too many incorrect codes. Request a new code to try again.'
                : 'The code is incorrect or has expired.';
            return;
        }

        passwordRecoveryVerifyForm.hidden = true;
        passwordRecoveryCompleteForm.hidden = false;
        document.getElementById('recoveryNewPassword').focus();
    } catch {
        recoveryVerifyMessage.textContent = 'Unable to verify the code right now. Please try again.';
    } finally {
        isRecoveringPassword = false;
        submitButton.disabled = false;
    }
});

document.getElementById('requestAnotherRecoveryCodeButton').addEventListener('click', () => {
    passwordRecoveryVerifyForm.hidden = true;
    passwordRecoveryRequestForm.hidden = false;
    recoveryCode.value = '';
    recoveryRequestMessage.textContent = '';
    recoveryEmail.focus();
});

passwordRecoveryCompleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isRecoveringPassword) return;

    isRecoveringPassword = true;
    const submitButton = passwordRecoveryCompleteForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    recoveryCompleteMessage.textContent = '';

    try {
        const response = await fetch('/user/password-reset/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                newPassword: passwordRecoveryCompleteForm.elements.newPassword.value,
                confirmPassword: passwordRecoveryCompleteForm.elements.confirmPassword.value,
            }),
        });

        if (!response.ok) {
            if (response.status === 400) {
                const result = await response.json();
                recoveryCompleteMessage.textContent = result.message;
            } else if (response.status === 401) {
                recoveryCompleteMessage.textContent = 'Your verification has expired. Request a new code and try again.';
            } else {
                recoveryCompleteMessage.textContent = 'Unable to reset your password right now. Please try again.';
            }
            return;
        }

        passwordRecoveryCompleteForm.hidden = true;
        passwordRecoverySuccess.hidden = false;
    } catch {
        recoveryCompleteMessage.textContent = 'Unable to reset your password right now. Please try again.';
    } finally {
        isRecoveringPassword = false;
        submitButton.disabled = false;
    }
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isCheckingPassword) return;

    isCheckingPassword = true;
    loginSubmitButton.disabled = true;
    loginMessage.textContent = '';

    try {
        const response = await fetch('/user/check_pass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: loginForm.elements.email.value,
                password: loginForm.elements.password.value,
            }),
        });

        if (!response.ok) {
            loginMessage.textContent = 'Email or password is incorrect.';
            return;
        }

        verificationInput.value = '';
        verificationMessage.textContent = '';
        verificationModal.show();
    } catch {
        loginMessage.textContent = 'Unable to sign in right now. Please try again.';
    } finally {
        isCheckingPassword = false;
        loginSubmitButton.disabled = false;
    }
});

document.getElementById('verifyCodeButton').addEventListener('click', async () => {
    verificationMessage.textContent = '';

    const response = await fetch('/user/verify_email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationInput.value }),
    });

    if (!response.ok) {
        verificationMessage.textContent = 'The code is incorrect or has expired.';
        return;
    }

    const { branches } = await response.json();
    branchChoices.replaceChildren();
    branchMessage.textContent = '';
    selectedBranch = undefined;

    branches.forEach((branch) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'branch-choice text-start';
        choice.setAttribute('aria-pressed', 'false');

        const icon = document.createElement('i');
        icon.className = 'bi bi-circle text-secondary';
        icon.setAttribute('aria-hidden', 'true');

        const details = document.createElement('span');
        details.className = 'flex-grow-1';
        const name = document.createElement('span');
        name.className = 'd-block fw-semibold';
        name.textContent = branch.location_name;
        const address = document.createElement('span');
        address.className = 'small text-secondary';
        address.textContent = branch.address;
        details.append(name, address);

        choice.append(icon, details);
        choice.addEventListener('click', () => {
            branchChoices.querySelectorAll('.branch-choice').forEach((item) => {
                item.classList.remove('selected');
                item.setAttribute('aria-pressed', 'false');
                item.firstElementChild.className = 'bi bi-circle text-secondary';
            });

            choice.classList.add('selected');
            choice.setAttribute('aria-pressed', 'true');
            icon.className = 'bi bi-record-circle-fill text-success';
            selectedBranch = branch;
        });
        branchChoices.append(choice);
    });

    if (branches.length === 0) {
        branchMessage.textContent = 'No active branches are available.';
    }

    verificationModal.hide();
    branchModal.show();
});

document.getElementById('continueBranchButton').addEventListener('click', () => {
    if (!selectedBranch) {
        branchMessage.textContent = 'Choose a branch to continue.';
        return;
    }

    branchMessage.textContent = '';
    confirmedBranch.textContent = `${selectedBranch.location_name} · ${selectedBranch.address}`;
    branchModal.hide();
    confirmationModal.show();
});

document.getElementById('changeBranchButton').addEventListener('click', () => {
    confirmationModalElement.addEventListener('hidden.bs.modal', () => {
        branchModal.show();
    }, { once: true });
    confirmationModal.hide();
});

document.getElementById('confirmBranchButton').addEventListener('click', async () => {
    const response = await fetch('/user/start_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: selectedBranch.id }),
    });

    if (response.ok) {
        const { redirect } = await response.json();
        window.location.assign(redirect);
    }
});