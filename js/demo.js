(() => {
    'use strict';

    const icons = {
        home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/>',
        devices: '<path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5l9 4.5 9-4.5"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.6 1.6 0 0 1 0 2.3l-.1.1a1.6 1.6 0 0 1-2.3 0l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.6 1.6 0 0 1-1.6 1.6h-.2a1.6 1.6 0 0 1-1.6-1.6v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.6 1.6 0 0 1-2.3 0l-.1-.1a1.6 1.6 0 0 1 0-2.3l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4.2a1.6 1.6 0 0 1 0-3.2h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.6 1.6 0 0 1 0-2.3l.1-.1a1.6 1.6 0 0 1 2.3 0l.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5v-.2a1.6 1.6 0 0 1 3.2 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.6 1.6 0 0 1 2.3 0l.1.1a1.6 1.6 0 0 1 0 2.3l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.2a1.6 1.6 0 0 1 0 3.2h-.2a1.6 1.6 0 0 0-1.5 1 1.6 1.6 0 0 0 .3 1.8Z" transform="translate(.2 1.1)"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/>',
        reports: '<path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M13 3v6h6M8 13h7m-7 4h5"/>',
        chevron: '<path d="m9 18 6-6-6-6"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        play: '<path d="m9 6 10 6-10 6z" fill="currentColor" stroke="none"/>',
        pause: '<path d="M9 5v14m6-14v14" stroke-width="2.6"/>',
        photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="m4 17 4-3.8 3.2 2.7L16 11l4.5 4.7"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
        link: '<path d="M10 13a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2m3 5a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2"/>',
        waveform: '<path d="M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        arrow: '<path d="M19 12H5m7 7-7-7 7-7"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>'
    };
    window.DemoIcon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;

    const $ = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    const activeDevice = id => data.devices.find(device => device.id === id);
    const savedReport = id => data.reports.find(report => report.id === id);
    const iconButton = (symbol, label, action) =>
        `<button type="button" class="icon-button" data-action="${action}" aria-label="${label}">${DemoIcon(symbol)}</button>`;

    const sheetLayer = $('sheet-layer');
    const sheet = $('app-sheet');
    const body = $('sheet-body');
    const nav = $('app-nav');
    const inventory = $('inventory-screen');
    const homeScreen = $('home-screen');
    const homeGreeting = $('home-greeting');
    const greetingName = $('home-greeting-name');
    const greetingMessage = $('home-greeting-message');
    const greetingQuestion = greetingMessage.textContent;
    const scanButton = $('scan-button');
    const scanProgress = $('home-scan-progress');
    const scanRing = $('home-scan-ring');
    const scanStatus = $('home-scan-status');
    const demoDuration = 3000;
    const panels = [];
    let data = TenData.load();
    let tab = 'home';
    let focusReturn = null;
    let toastTimer;
    let greetingTimer;
    let session = null;
    let sheetLoadingTimer;
    let unmountStory;
    let drag = null;

    function notice(message) {
        const toast = $('toast');
        window.clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.add('is-visible');
        toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
    }

    function renderHomeGreeting(animate = false) {
        window.clearTimeout(greetingTimer);
        const name = `${data.nickname.trim() || '현장 담당자'}님,`;
        homeGreeting.setAttribute('aria-label', `${name} ${greetingQuestion}`);
        homeGreeting.hidden = false;

        greetingName.classList.remove('is-typing');
        greetingMessage.classList.remove('is-typing');
        if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            greetingName.textContent = name;
            greetingMessage.textContent = greetingQuestion;
            return;
        }

        const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko') : null;
        const lines = [[greetingName, name], [greetingMessage, greetingQuestion]].map(([element, value]) => {
            const letters = segmenter ? Array.from(segmenter.segment(value), part => part.segment) : Array.from(value);
            const text = document.createTextNode('');
            element.replaceChildren(text);
            return { element, text, letters };
        });

        function typeCharacter(lineIndex, characterIndex = 0) {
            const { element, text, letters } = lines[lineIndex];
            if (characterIndex === 0) element.classList.add('is-typing');
            text.appendData(letters[characterIndex]);
            if (characterIndex + 1 < letters.length) {
                greetingTimer = window.setTimeout(() => typeCharacter(lineIndex, characterIndex + 1), 64);
                return;
            }
            element.classList.remove('is-typing');
            if (lineIndex + 1 < lines.length) {
                greetingTimer = window.setTimeout(() => typeCharacter(lineIndex + 1), 225);
            }
        }

        greetingTimer = window.setTimeout(() => typeCharacter(0), 130);
    }

    function updateTab() {
        homeScreen.hidden = tab !== 'home';
        inventory.hidden = tab !== 'inventory';
        $('settings-screen').hidden = tab !== 'settings';
        if (tab === 'inventory') DemoInventory.render(inventory, data);
        if (tab === 'settings') $('settings-screen').innerHTML = DemoViews.settings(data);
        nav.querySelectorAll('button').forEach(button => {
            if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    function panel(type, id, detail = {}) {
        if (!panels.length) focusReturn = document.activeElement;
        else panels.at(-1).scrollTop = body.scrollTop;
        panels.push({ type, id, ...detail });
        drawPanel();
    }

    function closePanels() {
        stopDemo();
        panels.length = 0;
        updateTab();
        drawPanel(false);
        const destination = focusReturn?.isConnected ? focusReturn : nav.querySelector('[aria-current]');
        destination?.focus({ preventScroll: true });
        focusReturn = null;
    }

    function back() {
        if (panels.length < 2) {
            closePanels();
            return;
        }
        stopDemo();
        panels.pop();
        drawPanel();
    }

    function changeTab(next, trigger) {
        if (tab === next && !panels.length) return;
        const enteringHome = tab !== 'home' && next === 'home';
        stopDemo();
        if (tab === 'home' && next !== 'home') renderHomeGreeting();
        panels.length = 0;
        tab = next;
        focusReturn = trigger;
        updateTab();
        if (enteringHome) renderHomeGreeting(true);
        drawPanel(false);
    }

    function measurement(device) {
        return `<div class="measurement">
            <div class="measurement-device"><span class="settings-icon">${DemoIcon('devices')}</span>
                <span><strong>${escape(device.name)}</strong><small>${escape(device.point)}${device.model ? ' · ' + escape(device.model) : ''}</small></span>
            </div>
            <div class="timer-orbit" id="demo-progress" role="progressbar" aria-label="장비 점검 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="timer-face">${DemoIcon('waveform', 36)}</div>
            </div>
            <button class="btn-secondary" type="button" data-action="back-sheet">취소</button>
        </div>`;
    }

    function confirmView({ id }) {
        const report = savedReport(id);
        return `<div class="confirm-content"><p><strong>${escape(report?.deviceName)}</strong> 리포트를 삭제할까요?</p>
            <div class="confirm-actions"><button class="btn-secondary" type="button" data-action="back-sheet">취소</button>
                <button class="btn-danger" type="button" data-action="confirm-delete">삭제</button></div></div>`;
    }

    function panelContent(current) {
        const { type, id } = current;
        switch (type) {
            case 'device': return ['장비 정보', DemoViews.device(data, id)];
            case 'profile': return ['프로필 설정', DemoViews.profile(data)];
            case 'reports': return ['리포트 관리', DemoViews.reports(data)];
            case 'manage-devices': return ['보유장비 관리', DemoViews.devices(data)];
            case 'device-form': return ['장비 추가', DemoViews.deviceForm()];
            case 'measuring': return ['가동음 점검', measurement(activeDevice(id))];
            case 'device-story-loading': return ['장비 정보', StoryReport.skeleton('장비 정보를 불러오고 있어요.')];
            case 'device-story': {
                const device = activeDevice(id);
                return ['장비 정보', device ? DemoInventory.detailStory(device, data)
                    : '<div class="empty-state"><strong>장비를 찾을 수 없습니다</strong></div>'];
            }
            case 'report-loading': return ['분석 리포트', StoryReport.skeleton()];
            case 'report': {
                const report = current.report || savedReport(id);
                if (!report) return ['분석 리포트', '<div class="empty-state"><strong>리포트를 찾을 수 없습니다</strong></div>'];
                const registered = activeDevice(report.deviceId);
                const device = current.device || registered;
                const image = device?.model === report.model ? device?.image : '';
                const renderer = report.recording === 'welding-demo' ? WeldingReport : StoryReport;
                return ['분석 리포트', renderer.render(report, { canRepeat: Boolean(registered), image })];
            }
            case 'confirm': return ['삭제 확인', confirmView(current)];
            case 'missing-tag': return ['등록되지 않은 장비', '<div class="empty-state"><p>이 브라우저에 연결된 장비가 없습니다.</p><button class="btn-primary" type="button" data-action="add-device">장비 추가</button></div>'];
            case 'tag-link': return ['NFC 링크', `<div class="form-stack"><label class="field"><span>장비 링크</span>
                <input id="tag-link-value" type="url" value="${escape(current.url)}" readonly></label></div>`];
        }
        return ['', ''];
    }

    function drawPanel(focus = true) {
        unmountStory?.();
        unmountStory = null;
        const current = panels.at(-1);
        const open = Boolean(current);
        if (!open && sheet.contains(document.activeElement)) document.activeElement.blur();
        sheetLayer.inert = !open;
        sheetLayer.setAttribute('aria-hidden', String(!open));
        sheetLayer.classList.toggle('is-open', open);
        $('home-screen').inert = open;
        inventory.inert = open;
        $('settings-screen').inert = open;
        if (!open) return;

        const [title, html] = panelContent(current);
        sheet.dataset.sheet = current.type;
        sheetLayer.dataset.sheet = current.type;
        $('sheet-title').textContent = title;
        $('sheet-back').hidden = panels.length < 2;
        body.innerHTML = html;
        body.setAttribute('aria-busy', String(current.type.endsWith('-loading')));
        body.scrollTop = current.scrollTop || 0;
        if (current.type === 'report') {
            const report = current.report || savedReport(current.id);
            if (report) {
                const renderer = report.recording === 'welding-demo' ? WeldingReport : StoryReport;
                unmountStory = renderer.mount(body, report);
            }
        } else if (current.type === 'device-story') {
            unmountStory = DemoInventory.mountStory(body, body);
        } else if (current.type === 'manage-devices') {
            DeviceManagement.mountList(body, removeManagedDevice);
        } else if (current.type === 'device-form') {
            DeviceManagement.mountForm(body, notice);
        }
        if (focus) sheet.focus({ preventScroll: true });
    }

    function setHomeScanActive(active) {
        homeScreen.classList.toggle('is-scanning', active);
        scanButton.setAttribute('aria-label', active ? '점검 취소' : '점검 시작');
    }

    function stopDemo() {
        if (session) cancelAnimationFrame(session.frame);
        session = null;
        window.clearTimeout(sheetLoadingTimer);
        setHomeScanActive(false);
        scanProgress.hidden = true;
        scanRing.style.strokeDashoffset = '100';
        scanProgress.setAttribute('aria-valuenow', '0');
        scanStatus.textContent = '';
    }

    function finishSheetLoading(nextType, delay, onComplete) {
        const loading = panels.at(-1);
        sheetLoadingTimer = window.setTimeout(() => {
            if (panels.at(-1) !== loading) return;
            loading.type = nextType;
            drawPanel(false);
            onComplete?.();
        }, delay);
    }

    function openDeviceStory(id, trigger) {
        if (!activeDevice(id)) return notice('등록된 장비를 찾을 수 없습니다.');
        const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel(animate ? 'device-story-loading' : 'device-story', id);
        if (panels.length === 1) focusReturn = trigger;
        if (animate) finishSheetLoading('device-story', 620);
    }

    function revealReport(device, fromHome) {
        let report;
        try {
            report = TenData.createReport(device);
            data = TenData.recordReport(report);
        } catch (error) {
            stopDemo();
            if (!fromHome) back();
            notice(error.message);
            return;
        }
        if (fromHome && activeDevice(device.id)) DemoInventory.focusDevice(device.id);
        if (tab === 'inventory') DemoInventory.refresh(data);
        if (!fromHome) panels.pop();
        panel('report-loading', report.id, { report, device });
        if (fromHome) focusReturn = scanButton;
        finishSheetLoading('report', 720, () => {
            if (data.storageIssue) notice(data.storageIssue);
        });
    }

    function beginDemo(id, fromHome = false) {
        if (session) return;
        const device = fromHome ? TenData.homeDemoDevice() : activeDevice(id);
        if (!device) return notice('등록된 장비를 찾을 수 없습니다.');
        stopDemo();
        if (fromHome) {
            setHomeScanActive(true);
            scanProgress.hidden = false;
            scanProgress.setAttribute('aria-label', `${device.name} 점검 진행률`);
            scanStatus.textContent = `${device.name} 점검을 시작했어요.`;
        } else {
            if (panels.at(-1)?.type === 'report') panels.pop();
            panel('measuring', id);
        }

        const progress = fromHome ? scanProgress : $('demo-progress');
        const run = { fromHome, start: performance.now(), frame: 0, percent: -1 };
        session = run;

        function tick(now) {
            if (session !== run) return;
            const fraction = Math.max(0, Math.min(1, (now - run.start) / demoDuration));
            const percent = Math.floor(fraction * 100);
            if (fromHome) scanRing.style.strokeDashoffset = String((1 - fraction) * 100);
            else progress.style.setProperty('--progress', fraction * 100 + '%');
            if (run.percent !== percent) {
                run.percent = percent;
                progress.setAttribute('aria-valuenow', String(percent));
            }

            if (fraction < 1) {
                run.frame = requestAnimationFrame(tick);
                return;
            }
            session = null;
            if (fromHome) {
                setHomeScanActive(false);
                scanStatus.textContent = '점검을 마쳤어요. 분석 리포트를 준비하고 있어요.';
            }
            revealReport(device, fromHome);
        }
        run.frame = requestAnimationFrame(tick);
    }

    function tagUrl(id) {
        const url = new URL(location.pathname, location.href);
        url.searchParams.set('device', id);
        return url.href;
    }

    async function copyTag(id) {
        if (!activeDevice(id)) return;
        const url = tagUrl(id);
        try {
            await navigator.clipboard.writeText(url);
            notice('장비의 NFC 링크를 복사했습니다.');
        } catch {
            panel('tag-link', id, { url });
            $('tag-link-value').select();
        }
    }

    function download(id) {
        const saved = savedReport(id);
        if (!saved) return notice('저장할 리포트를 찾을 수 없습니다.');
        const report = TenData.reportForDisplay(saved);
        const details = report.recording === 'welding-demo' ? WeldingReport.exportLines() : [
            report.rpmContext,
            '', '참고 신호의 주파수 변화 (기준 / 비교, dBFS)',
            ...report.peaks.map(peak => peak.hz + ' Hz  ' + peak.baseline + ' / ' + peak.measured + '  (' + peak.change + ' dB)'),
            '', '분석 근거', ...report.observations, '', '확인할 항목', ...report.nextChecks
        ];
        const text = ['10초만 분석 리포트', [report.deviceName, report.model].filter(Boolean).join(' · '),
            date.format(new Date(report.createdAt)), '', report.statusLabel, report.summary, '', ...details]
            .filter(value => value != null).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = '10초만-' + report.deviceName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50) + '.txt';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function removeManagedDevice(id) {
        const current = panels.at(-1);
        const index = data.devices.findIndex(device => device.id === id);
        if (current?.type !== 'manage-devices' || index < 0) return;
        current.scrollTop = body.scrollTop;
        data = TenData.deleteDevice(id);
        drawPanel(false);
        const rows = body.querySelectorAll('[data-device-swipe-toggle]');
        const destination = rows[Math.min(index, rows.length - 1)] || body.querySelector('.managed-device-add');
        destination?.focus({ preventScroll: true });
        notice(data.storageIssue || '장비를 삭제했습니다.');
    }

    function save(form) {
        const fields = Object.fromEntries(new FormData(form));
        try {
            if (form.dataset.form === 'profile') {
                data = TenData.setNickname(fields.nickname);
                renderHomeGreeting();
                updateTab();
                back();
                notice(data.storageIssue || '닉네임을 저장했습니다.');
            } else if (form.dataset.form === 'device') {
                const image = form.querySelector('[data-device-photo-preview]').getAttribute('src') || '';
                if (form.elements.image.files.length && !image) return;
                data = TenData.saveDevice({ name: fields.name, details: fields.details, image });
                back();
                if (panels.at(-1)?.type === 'manage-devices') body.scrollTop = body.scrollHeight;
                notice(data.storageIssue || '장비를 추가했습니다.');
            }
        } catch (error) {
            notice(error.message);
        }
    }

    function perform(action, id, trigger) {
        switch (action) {
            case 'scan':
                if (session?.fromHome) {
                    stopDemo();
                    scanStatus.textContent = '점검을 취소했어요.';
                } else {
                    beginDemo(null, true);
                }
                break;
            case 'open-device': panel('device', id); break;
            case 'device-story': openDeviceStory(id, trigger); break;
            case 'add-device': panel('device-form'); break;
            case 'edit-profile': panel('profile'); break;
            case 'manage-reports': panel('reports'); break;
            case 'manage-devices': panel('manage-devices'); break;
            case 'open-report': panel('report', id); break;
            case 'remove-device': removeManagedDevice(id); break;
            case 'remove-report': panel('confirm', id); break;
            case 'confirm-delete': {
                const current = panels.at(-1);
                data = TenData.deleteReport(current.id);
                back();
                notice(data.storageIssue || '리포트를 삭제했습니다.');
                break;
            }
            case 'run-demo': beginDemo(id); break;
            case 'copy-tag-link': void copyTag(id); break;
            case 'download-report': download(id); break;
            case 'close-sheet': closePanels(); break;
            case 'back-sheet': back(); break;
        }
    }

    document.addEventListener('click', event => {
        const navigation = event.target.closest('button[data-tab]');
        if (navigation) return changeTab(navigation.dataset.tab, navigation);
        const control = event.target.closest('button[data-action]');
        if (control) perform(control.dataset.action, control.dataset.id, control);
    });
    document.addEventListener('submit', event => {
        if (!event.target.matches('form[data-form]')) return;
        event.preventDefault();
        save(event.target);
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (panels.length) back();
        else if (session) stopDemo();
    });

    const grip = $('sheet-grip');
    grip.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        drag = { id: event.pointerId, start: event.clientY, distance: 0 };
        sheet.classList.add('is-dragging');
        grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        drag.distance = Math.max(0, event.clientY - drag.start);
        sheet.style.setProperty('--sheet-drag', drag.distance + 'px');
    });
    function finishDrag(event) {
        if (drag?.id !== event.pointerId) return;
        const dismiss = event.type === 'pointerup' && drag.distance > 72;
        drag = null;
        sheet.classList.remove('is-dragging');
        sheet.style.removeProperty('--sheet-drag');
        if (dismiss) closePanels();
    }
    grip.addEventListener('pointerup', finishDrag);
    grip.addEventListener('pointercancel', finishDrag);
    grip.addEventListener('lostpointercapture', finishDrag);

    for (const button of nav.querySelectorAll('button')) {
        const name = button.dataset.tab === 'inventory' ? 'devices' : button.dataset.tab;
        button.querySelector('.nav-icon').innerHTML = DemoIcon(name);
    }
    $('sheet-back').innerHTML = DemoIcon('arrow');
    $('sheet-actions').innerHTML = iconButton('close', '닫기', 'close-sheet');
    renderHomeGreeting(true);
    updateTab();

    const url = new URL(location.href);
    const linked = url.searchParams.get('device') || url.searchParams.get('point')?.split('-')[0];
    if (linked) {
        if (activeDevice(linked)) panel('device', linked);
        else panel('missing-tag');
    }
    if (data.storageIssue) notice(data.storageIssue);
})();
