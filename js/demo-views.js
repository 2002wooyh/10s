(function (global) {
    'use strict';

    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
    const icon = (name, size) => global.DemoIcon(name, size);
    const profileInitial = name => Array.from(name.trim())[0];
    const reportDate = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    function emptyState(title, description) {
        return `<div class="empty-state"><strong>${title}</strong><p>${description}</p></div>`;
    }

    function thumbnail(device = {}) {
        const picture = /^assets\/equipment\/[^/]+$/.test(device.image) || global.TenData.isDevicePhoto(device.image)
            ? `<img src="${escape(device.image)}" alt="" loading="lazy" decoding="async">`
            : icon('devices', 24);
        return `<span class="device-thumb" aria-hidden="true">${picture}</span>`;
    }

    function device({ devices }, id) {
        const item = devices.find(candidate => candidate.id === id);
        if (!item) return emptyState('장비를 찾을 수 없습니다', '장비 목록에서 다시 선택해 주세요.');

        const details = [
            ['장비 유형', item.category],
            ['모델명', item.model],
            ['측정 위치', item.point],
            ['기준 회전수', item.rpm ? `${item.rpm.toLocaleString('ko-KR')} rpm` : '']
        ].filter(([, value]) => value);
        return `<div class="device-detail">
            <div class="device-detail-hero">${thumbnail(item)}<strong>${escape(item.name)}</strong></div>
            <dl class="device-facts">${details.map(([label, value]) =>
                `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
            ${item.details ? `<p class="device-notes">${escape(item.details)}</p>` : ''}
            <div class="device-actions">
                <button class="btn-primary" type="button" data-action="run-demo" data-id="${escape(id)}">
                    ${icon('waveform', 20)} 점검 시작
                </button>
                <button class="btn-secondary" type="button" data-action="copy-tag-link" data-id="${escape(id)}">
                    ${icon('link', 19)} NFC 링크 복사
                </button>
            </div>
        </div>`;
    }

    function settings({ nickname }) {
        const initial = profileInitial(nickname);
        const rows = [
            { action: 'edit-profile', symbol: 'user', title: '프로필 설정' },
            { action: 'manage-reports', symbol: 'reports', title: '리포트 관리' },
            { action: 'manage-devices', symbol: 'devices', title: '보유장비 관리' },
            { action: 'manage-developers', symbol: 'code', title: '개발자 정보' }
        ];
        return `<section class="settings-content" aria-labelledby="settings-title">
            <h1 id="settings-title" class="settings-title">설정</h1>
            <button class="profile-card" type="button" data-action="edit-profile" aria-label="${escape(nickname)} 프로필 편집">
                <span class="settings-icon profile-avatar" aria-hidden="true">${initial ? escape(initial) : icon('user', 25)}</span>
                <span class="settings-copy"><strong>${escape(nickname)}</strong></span>
                <span class="row-chevron" aria-hidden="true">${icon('chevron', 18)}</span>
            </button>
            <ul class="settings-list">${rows.map(row => `<li>
                <button class="settings-row" type="button" data-action="${row.action}">
                    <span class="settings-icon" aria-hidden="true">${icon(row.symbol, 21)}</span>
                    <span class="settings-copy"><strong>${row.title}</strong></span>
                    <span class="row-chevron" aria-hidden="true">${icon('chevron', 18)}</span>
                </button>
            </li>`).join('')}</ul>
        </section>`;
    }

    function profile({ nickname }) {
        return `<form class="form-stack" data-form="profile">
            <label class="field"><span>닉네임</span>
                <input name="nickname" autocomplete="nickname" value="${escape(nickname)}" maxlength="20" required>
            </label>
            <button class="btn-primary" type="submit">저장</button>
        </form>`;
    }

    function managedRow({ id, name, device, model, details, report = false }) {
        const rowId = escape(id);
        const label = escape(name);
        const front = report ? `data-action="open-report" data-id="${rowId}"`
            : `data-device-swipe-toggle aria-label="${label} 삭제 옵션"`;
        return `<li class="managed-device" data-swipe-row="${rowId}"${report ? '' : ` data-managed-device="${rowId}"`}>
            <button class="device-row managed-device-front" type="button" data-swipe-front ${front}
                aria-expanded="false" aria-keyshortcuts="ArrowLeft ArrowRight">
                ${thumbnail(device)}
                <span class="device-copy">
                    <strong>${label}</strong>
                    ${model ? `<span class="device-meta">${escape(model)}</span>` : ''}
                    ${details ? `<span class="device-meta managed-device-description">${escape(details)}</span>` : ''}
                </span>
            </button>
            <button class="managed-device-delete" type="button" data-swipe-delete data-action="${report ? 'remove-report' : 'remove-device'}"
                data-id="${rowId}" aria-label="${label} ${report ? '리포트' : '장비'} 삭제" inert>삭제</button>
        </li>`;
    }

    function reports({ reports, devices }) {
        if (!reports.length) {
            return emptyState('저장된 리포트가 없어요', '점검이 끝나면 AI 분석 리포트를 여기에서 확인할 수 있어요.');
        }
        const registered = new Map(devices.map(device => [device.id, device]));
        const homeDevice = global.TenData.homeDemoDevice();
        return `<ul class="device-list report-list" data-managed-report-list>${reports.map(savedReport => {
            const report = global.TenData.reportForDisplay(savedReport);
            const device = registered.get(report.deviceId) || (report.deviceId === homeDevice.id ? homeDevice : undefined);
            const when = new Date(report.createdAt);
            const formatted = Number.isNaN(when.getTime()) ? '' : reportDate.format(when);
            return managedRow({
                id: report.id, name: report.deviceName, model: report.model,
                device: device?.model === report.model ? device : undefined,
                details: [formatted, report.statusLabel].filter(Boolean).join(' · '), report: true
            });
        }).join('')}</ul>`;
    }

    function managementList(list, action, label) {
        return `<div class="device-management">${list}
            <div class="device-management-footer">
                <button class="managed-device-add" type="button" data-action="${action}" aria-label="${label}">${icon('plus', 25)}</button>
            </div>
        </div>`;
    }

    function devices({ devices }) {
        const list = devices.length ? `<ul class="device-list managed-device-list" data-managed-device-list>${devices.map(item =>
            managedRow({ ...item, device: item })).join('')}</ul>` : emptyState('등록된 장비가 없습니다', '아래 + 버튼으로 장비를 추가할 수 있어요.');
        return managementList(list, 'add-device', '장비 추가');
    }

    function developers({ developers }) {
        const list = developers.length ? `<ul class="device-list" data-managed-developer-list>${developers.map(person => {
            const id = escape(person.id);
            const name = escape(person.name);
            const photo = global.TenData.isDevicePhoto(person.image)
                ? `<img src="${escape(person.image)}" alt="" decoding="async">` : escape(profileInitial(person.name));
            return `<li class="managed-device managed-developer" data-swipe-row="${id}">
                <button class="device-row managed-device-front" type="button" data-swipe-front
                    aria-expanded="false" aria-keyshortcuts="ArrowLeft ArrowRight">
                    <span class="developer-avatar" aria-hidden="true">${photo}</span>
                    <span class="device-copy"><strong>${name}</strong><span class="device-meta">${escape(person.role)}</span></span>
                </button>
                <div class="managed-developer-actions" data-swipe-actions>
                    <button class="managed-developer-edit" type="button" data-swipe-edit data-action="edit-developer"
                        data-id="${id}" aria-label="${name} 개발자 수정" inert>수정</button>
                    <button class="managed-device-delete" type="button" data-swipe-delete data-action="remove-developer"
                        data-id="${id}" aria-label="${name} 개발자 삭제" inert>삭제</button>
                </div>
            </li>`;
        }).join('')}</ul>` : emptyState('등록된 개발자가 없어요', '아래 + 버튼으로 개발자를 추가할 수 있어요.');
        return managementList(list, 'add-developer', '개발자 추가');
    }

    function deviceForm() {
        return `<form class="form-stack managed-device-form" data-form="device">
            <label class="device-photo-picker">
                <input class="visually-hidden" name="image" type="file" accept="image/*" aria-label="장비 사진">
                <span class="device-photo-prompt" data-device-photo-prompt>${icon('photo', 25)}<span>사진 추가</span></span>
                <img class="device-photo-preview" data-device-photo-preview alt="선택한 장비 사진" hidden>
            </label>
            <label class="field"><span>이름</span><input name="name" maxlength="60" placeholder="예: CNC 선반 01" required></label>
            <label class="field"><span>상세</span><textarea name="details" maxlength="600" rows="4" placeholder="장비에 대해 기록해 둘 내용을 적어 주세요."></textarea></label>
            <button class="btn-primary" type="submit">장비 추가</button>
        </form>`;
    }

    function developerForm(person) {
        const image = global.TenData.isDevicePhoto(person?.image) ? person.image : '';
        return `<form class="form-stack managed-device-form" data-form="developer">
            <label class="device-photo-picker developer-photo-picker">
                <input class="visually-hidden" name="image" type="file" accept="image/*" aria-label="프로필 사진">
                <span class="device-photo-prompt" data-device-photo-prompt${image ? ' hidden' : ''}>
                    <span class="developer-avatar" aria-hidden="true">${icon('user', 30)}</span><span>프로필 사진 추가</span>
                </span>
                <img class="device-photo-preview" data-device-photo-preview alt="개발자 프로필 사진"
                    ${image ? `src="${escape(image)}"` : 'hidden'}>
            </label>
            <button class="inventory-text-button developer-photo-remove" type="button" data-remove-photo${image ? '' : ' hidden'}>기본 사진으로 변경</button>
            <label class="field"><span>이름</span><input name="name" value="${escape(person?.name)}" maxlength="60" required></label>
            <label class="field"><span>업무</span><input name="role" value="${escape(person?.role)}" maxlength="60" required></label>
            <button class="btn-primary" type="submit">${person ? '저장' : '개발자 추가'}</button>
        </form>`;
    }

    global.DemoViews = { device, settings, profile, reports, devices, deviceForm, developers, developerForm };
})(globalThis);
