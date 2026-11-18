const readline = require('node:readline');
const db = require('../lib/database');
const { hashPassword } = require('../lib/password');
const { isAssignableUserRole, normalizeUserRole } = require('../lib/user-roles');

const roles = new Map([
    ['admin', 'admin'],
    ['manager', 'manager'],
    ['supervisor', 'supervisor'],
    ['service-crew', 'service-crew'],
]);

const ask = (prompt) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
    });
});

const askPassword = () => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('Run this script in an interactive terminal to enter the password securely.');
    }

    return new Promise((resolve, reject) => {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdout.write('Password: ');

        let password = '';
        const cleanup = () => {
            process.stdin.removeListener('keypress', onKeypress);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\n');
        };
        const onKeypress = (character, key = {}) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                reject(new Error('Account creation cancelled.'));
            } else if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                resolve(password);
            } else if (key.name === 'backspace') {
                const characters = Array.from(password);
                if (characters.length > 0) {
                    characters.pop();
                    password = characters.join('');
                    process.stdout.write('\b \b');
                }
            } else if (!key.ctrl && !key.meta && character) {
                password += character;
                process.stdout.write('*');
            }
        };

        process.stdin.on('keypress', onKeypress);
    });
};

const createAccount = (account) => {
    const duplicate = db.prepare('SELECT id FROM "user" WHERE lower(email) = ?').get(account.email);
    if (duplicate) {
        throw new Error('An account with that email already exists.');
    }

    const result = db.prepare(`
        INSERT INTO "user" (email, hashed_password, first_name, last_name, role, status)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        account.email,
        hashPassword(account.password),
        account.firstName,
        account.lastName,
        account.role,
        account.status
    );

    return result.lastInsertRowid;
};

const main = async () => {
    const email = (await ask('Email: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw new Error('Enter a valid email address (254 characters or fewer).');
    }

    const firstNameInput = (await ask('First name (optional): ')).trim();
    const lastNameInput = (await ask('Last name (optional): ')).trim();
    if (firstNameInput.length > 100 || lastNameInput.length > 100) {
        throw new Error('Names must be 100 characters or fewer.');
    }

    const roleInput = normalizeUserRole(await ask('Role (admin, manager, supervisor, service-crew): '));
    const role = roles.get(roleInput);
    if (!role || !isAssignableUserRole(role)) {
        throw new Error('Choose one of: admin, manager, supervisor, service-crew.');
    }

    const statusInput = (await ask('Status (active/inactive, default active): ')).trim().toLowerCase();
    const status = statusInput || 'active';
    if (status !== 'active' && status !== 'inactive') {
        throw new Error('Status must be active or inactive.');
    }

    const password = await askPassword();
    if (password.length < 8 || password.length > 256) {
        throw new Error('Password must be between 8 and 256 characters.');
    }

    const id = createAccount({
        email,
        firstName: firstNameInput || null,
        lastName: lastNameInput || null,
        role,
        status,
        password,
    });
    console.log(`Created ${role} account for ${email} (ID ${id}).`);
};

main()
    .catch((error) => {
        console.error(`Account creation failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => db.close());
