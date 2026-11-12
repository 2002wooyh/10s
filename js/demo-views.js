(function (global) {
    'use strict';

    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
    const icon = (name, size) => global.DemoIcon(name, size);
    const reportDate = new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    function emptyState(title, description) {
        return `<div class="empty-state"><strong>${title}</strong><p>${description}</p></div>`;
    }

    function thumbnail(device) {
        const picture = device.image
            ? `<img src="${escape(device.image)}" alt="" loading="lazy" decoding="async">`
            : icon('devices', 24);
        return `<span class="device-thumb" aria-hidden="true">${picture}</span>`;
    }

    function deviceCopy(device) {
        return `<span class="device-copy">
            <strong>${escape(device.name)}</strong>
            <span class="device-meta">${escape(device.category)}${device.model ? ` · ${escape(device.model)}` : ''}</span>
        </span>`;
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
            <div class="device-actions">
                <button class="btn-primary" type="button" data-action="run-demo" data-id="${escape(id)}">
                    ${icon('waveform', 20)} 점검 시연
                </button>
                <button class="btn-secondary" type="button" data-action="copy-tag-link" data-id="${escape(id)}">
                    ${icon('link', 19)} NFC 링크 복사
                </button>
            </div>
        </div>`;
    }

    function settings({ nickname }) {
        const initial = Array.from(nickname.trim())[0];
        const rows = [
            { action: 'edit-profile', symbol: 'user', title: '프로필 설정' },
            { action: 'manage-reports', symbol: 'reports', title: '리포트 관리' },
            { action: 'manage-devices', symbol: 'devices', title: '보유장비 관리' }
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

    function reports({ reports }) {
        if (!reports.length) {
            return emptyState('저장된 리포트가 없습니다', '측정이 끝나면 리포트를 여기에서 확인할 수 있습니다.');
        }
        return `<ul class="device-list report-list">${reports.map(report => {
            const status = ['stable', 'attention', 'check'].includes(report.status) ? report.status : '';
            const when = new Date(report.createdAt);
            const formatted = Number.isNaN(when.getTime()) ? '' : reportDate.format(when);
            return `<li class="manage-row">
                <button class="device-row" type="button" data-action="open-report" data-id="${escape(report.id)}">
                    <span class="settings-icon" aria-hidden="true">${icon('reports', 20)}</span>
                    <span class="device-copy">
                        <strong>${escape(report.deviceName)}</strong>
                        <span class="device-meta">${escape(report.point)}${formatted ? ` · ${escape(formatted)}` : ''}</span>
                        <span class="chip ${status}">${escape(report.statusLabel)}</span>
                    </span>
                </button>
                <button class="row-icon-button" type="button" data-action="remove-report" data-id="${escape(report.id)}"
                    aria-label="${escape(report.deviceName)} 리포트 삭제">${icon('trash', 19)}</button>
            </li>`;
        }).join('')}</ul>`;
    }

    function devices(state) {
        const list = state.devices.length ? `<ul class="device-list">${state.devices.map(item => `<li class="manage-row">
            <button class="device-row" type="button" data-action="edit-device" data-id="${escape(item.id)}">
                ${thumbnail(item)}
                ${deviceCopy(item)}
                <span class="row-chevron" aria-hidden="true">${icon('edit', 18)}</span>
            </button>
            <button class="row-icon-button" type="button" data-action="remove-device" data-id="${escape(item.id)}"
                aria-label="${escape(item.name)} 장비 삭제">${icon('trash', 19)}</button>
        </li>`).join('')}</ul>` : emptyState('등록된 장비가 없습니다', '장비를 추가하고 측정 위치를 지정해 주세요.');
        return `<div class="device-management">${list}
            <button class="btn-primary" type="button" data-action="add-device">${icon('plus', 20)} 장비 추가</button>
        </div>`;
    }

    function deviceForm(state, id) {
        const item = id ? state.devices.find(candidate => candidate.id === id) : null;
        if (id && !item) return emptyState('장비를 찾을 수 없습니다', '장비 목록에서 다시 선택해 주세요.');
        return `<form class="form-stack" data-form="device"${item ? ` data-id="${escape(id)}"` : ''}>
            <label class="field"><span>장비 이름</span>
                <input name="name" maxlength="60" value="${escape(item?.name)}" placeholder="예: CNC 선반 01" required>
            </label>
            <label class="field"><span>장비 유형</span>
                <input name="category" maxlength="40" value="${escape(item?.category)}" placeholder="예: CNC 선반" required>
            </label>
            <label class="field"><span>모델명 (선택)</span>
                <input name="model" maxlength="80" value="${escape(item?.model)}">
            </label>
            <label class="field"><span>측정 위치</span>
                <input name="point" maxlength="60" value="${escape(item?.point)}" placeholder="예: 주축 전면" required>
            </label>
            <label class="field"><span>기준 회전수 (rpm, 선택)</span>
                <input name="rpm" type="number" min="1" max="50000" step="1" inputmode="numeric" value="${escape(item?.rpm)}">
            </label>
            <button class="btn-primary" type="submit">${item ? '변경사항 저장' : '장비 추가'}</button>
        </form>`;
    }

    global.DemoViews = { device, settings, profile, reports, devices, deviceForm };
})(globalThis);
