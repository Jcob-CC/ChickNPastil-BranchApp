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