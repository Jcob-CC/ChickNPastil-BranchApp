const sendEmail = require('./emailer');

const sendExpenseApprovalEmail = ({ to, requestId, branchName, totalPrice, approvedNote }) =>
    sendEmail({
        to,
        subject: `Expense request #${requestId} approved`,
        text: [
            `Your expense request #${requestId} for ${branchName} has been approved.`,
            `Total: ${Number(totalPrice).toFixed(2)} PHP`,
            approvedNote ? `Approval note: ${approvedNote}` : null,
        ].filter(Boolean).join('\n'),
    });

module.exports = sendExpenseApprovalEmail;
