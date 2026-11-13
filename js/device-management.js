(function (global) {
    'use strict';

    function mountList(container, onDelete) {
        const list = container.querySelector('[data-managed-device-list]');
        if (!list) return;

        let openRow = null;
        let swipe = null;
        let suppressClick = false;

        function setExpanded(row, expanded) {
            row.classList.toggle('is-open', expanded);
            row.querySelector('[data-device-swipe-toggle]').setAttribute('aria-expanded', String(expanded));
            row.querySelector('.managed-device-delete').inert = !expanded;
        }

        function reveal(row) {
            if (openRow === row) return;
            if (openRow) setExpanded(openRow, false);
            openRow = row;
            if (row) setExpanded(row, true);
        }

        list.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0) return;
            suppressClick = false;
            const deleteButton = event.target.closest('.managed-device-delete');
            if (event.pointerType === 'touch' && deleteButton && !deleteButton.inert) {
                const row = deleteButton.closest('[data-managed-device]');
                swipe = { row, id: event.pointerId, x: event.clientX, y: event.clientY, deleteButton };
                return;
            }
            const front = event.target.closest('[data-device-swipe-toggle]');
            if (!front) return;
            const row = front.closest('[data-managed-device]');
            swipe = { row, id: event.pointerId, x: event.clientX, y: event.clientY, wasOpen: row === openRow, horizontal: false };
        });

        list.addEventListener('pointermove', event => {
            if (swipe?.id !== event.pointerId) return;
            const dx = event.clientX - swipe.x;
            const dy = event.clientY - swipe.y;
            if (swipe.deleteButton) {
                if (Math.hypot(dx, dy) > 9) swipe = null;
                return;
            }
            if (!swipe.horizontal) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
                suppressClick = true;
                if (Math.abs(dx) <= Math.abs(dy)) {
                    swipe = null;
                    return;
                }
                swipe.horizontal = true;
                if (event.pointerType === 'mouse') swipe.row.setPointerCapture(event.pointerId);
                swipe.row.classList.add('is-swiping');
            }
            const actionWidth = swipe.row.querySelector('.managed-device-delete').offsetWidth;
            const offset = (swipe.wasOpen ? -actionWidth : 0) + dx;
            swipe.row.style.setProperty('--device-swipe-offset', Math.max(-actionWidth - 46, Math.min(0, offset)) + 'px');
        });

        function finishSwipe(event) {
            if (swipe?.id !== event.pointerId) return;
            const { row, x, y, wasOpen, horizontal, deleteButton } = swipe;
            swipe = null;
            if (deleteButton) {
                const insideButton = deleteButton.contains(document.elementFromPoint(event.clientX, event.clientY));
                if (event.type === 'pointerup' && row === openRow && insideButton &&
                    Math.hypot(event.clientX - x, event.clientY - y) <= 9) {
                    onDelete(row.dataset.managedDevice);
                }
                return;
            }
            if (!horizontal) return;
            row.classList.remove('is-swiping');
            row.style.removeProperty('--device-swipe-offset');
            if (event.type !== 'pointerup') return;
            const distance = event.clientX - x;
            if (distance <= -46 && wasOpen) onDelete(row.dataset.managedDevice);
            else if (distance <= -46) reveal(row);
            else if (distance >= 36 && wasOpen) reveal(null);
        }

        list.addEventListener('pointerup', finishSwipe);
        list.addEventListener('pointercancel', finishSwipe);
        list.addEventListener('lostpointercapture', finishSwipe);
        list.addEventListener('pointerleave', event => {
            if (!swipe?.horizontal) finishSwipe(event);
        });

        list.addEventListener('click', event => {
            if (suppressClick && event.detail > 0) {
                suppressClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const front = event.target.closest('[data-device-swipe-toggle]');
            if (front) {
                const row = front.closest('[data-managed-device]');
                reveal(row === openRow ? null : row);
            }
        });

        list.addEventListener('keydown', event => {
            const row = event.target.closest('[data-managed-device]');
            if (event.key === 'ArrowLeft' && row) {
                event.preventDefault();
                reveal(row);
            } else if (openRow && (event.key === 'ArrowRight' || event.key === 'Escape')) {
                event.preventDefault();
                event.stopPropagation();
                openRow.querySelector('[data-device-swipe-toggle]').focus({ preventScroll: true });
                reveal(null);
            }
        });
    }

    async function normalizePhoto(file) {
        const url = URL.createObjectURL(file);
        const photo = new Image();
        try {
            photo.src = url;
            await photo.decode();
            const longest = Math.max(photo.naturalWidth, photo.naturalHeight);
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { alpha: false });
            for (const limit of [720, 540, 400, 320]) {
                const ratio = Math.min(1, limit / longest);
                canvas.width = Math.max(1, Math.round(photo.naturalWidth * ratio));
                canvas.height = Math.max(1, Math.round(photo.naturalHeight * ratio));
                context.fillStyle = '#fff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(photo, 0, 0, canvas.width, canvas.height);
                const image = canvas.toDataURL('image/jpeg', .76);
                if (global.TenData.isDevicePhoto(image)) return image;
            }
            throw new Error('Photo exceeds the storage limit');
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function mountForm(container, notice) {
        const form = container.querySelector('.managed-device-form');
        const input = form.elements.image;
        const preview = form.querySelector('[data-device-photo-preview]');
        const prompt = form.querySelector('[data-device-photo-prompt]');
        const submit = form.querySelector('button[type="submit"]');
        let photoRequest = 0;
        input.addEventListener('change', async () => {
            const request = ++photoRequest;
            const file = input.files[0];
            preview.removeAttribute('src');
            preview.hidden = true;
            prompt.hidden = false;
            submit.disabled = Boolean(file);
            if (!file) return;
            try {
                const image = await normalizePhoto(file);
                if (request !== photoRequest || !form.isConnected) return;
                preview.src = image;
                preview.hidden = false;
                prompt.hidden = true;
            } catch {
                if (request !== photoRequest || !form.isConnected) return;
                input.value = '';
                notice('사진을 읽을 수 없어요. 다른 사진을 선택해 주세요.');
            } finally {
                if (request === photoRequest && form.isConnected) submit.disabled = false;
            }
        });
    }

    global.DeviceManagement = { mountList, mountForm };
})(globalThis);
