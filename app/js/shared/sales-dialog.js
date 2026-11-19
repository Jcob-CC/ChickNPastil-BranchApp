(function () {
  function ensureSalesDialog() {
    let modalElement = document.getElementById('salesCenteredDialog');
    if (modalElement) return modalElement;

    modalElement = document.createElement('div');
    modalElement.className = 'modal fade';
    modalElement.id = 'salesCenteredDialog';
    modalElement.tabIndex = '-1';
    modalElement.setAttribute('aria-hidden', 'true');
    modalElement.innerHTML = `
      <div class="modal-dialog modal-dialog-centered" style="max-width: 420px;">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-header border-0 pb-1">
            <h5 class="modal-title fw-bold" id="salesCenteredDialogTitle">Notice</h5>
            <button type="button" class="btn-close" data-action="close" aria-label="Close"></button>
          </div>
          <div class="modal-body py-3">
            <p class="mb-0 text-dark" id="salesCenteredDialogMessage"></p>
          </div>
          <div class="modal-footer border-0 pt-1">
            <button type="button" class="btn btn-outline-secondary rounded-pill px-4" data-action="cancel">Cancel</button>
            <button type="button" class="btn btn-success rounded-pill px-4 fw-semibold" data-action="confirm">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalElement);
    return modalElement;
  }

  function showSalesAlert(message, title = 'Notice') {
    const modalElement = ensureSalesDialog();
    modalElement.querySelector('#salesCenteredDialogTitle').textContent = title;
    modalElement.querySelector('#salesCenteredDialogMessage').textContent = String(message);
    modalElement.querySelector('[data-action="cancel"]').style.display = 'none';
    modalElement.querySelector('[data-action="confirm"]').textContent = 'OK';

    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    modalElement.querySelector('[data-action="confirm"]').onclick = () => modal.hide();
    modalElement.querySelector('[data-action="close"]').onclick = () => modal.hide();
    modal.show();
  }

  function showSalesConfirm(message, title = 'Please confirm') {
    const modalElement = ensureSalesDialog();
    modalElement.querySelector('#salesCenteredDialogTitle').textContent = title;
    modalElement.querySelector('#salesCenteredDialogMessage').textContent = String(message);
    modalElement.querySelector('[data-action="cancel"]').style.display = 'inline-block';
    modalElement.querySelector('[data-action="confirm"]').textContent = 'Confirm';

    return new Promise(resolve => {
      const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
      const confirmButton = modalElement.querySelector('[data-action="confirm"]');
      const cancelButton = modalElement.querySelector('[data-action="cancel"]');
      const closeButton = modalElement.querySelector('[data-action="close"]');

      confirmButton.onclick = () => {
        modal.hide();
        resolve(true);
      };
      cancelButton.onclick = () => {
        modal.hide();
        resolve(false);
      };
      closeButton.onclick = () => {
        modal.hide();
        resolve(false);
      };
      modal.show();
    });
  }

  window.showSalesAlert = showSalesAlert;
  window.showSalesConfirm = showSalesConfirm;
  window.alert = showSalesAlert;
})();
