(function (global) {
    'use strict';

    const storageKey = '10seconds:demo:v1';
    const defaultNickname = '현장 담당자';
    const statusLabels = {
        stable: '기준과 유사',
        attention: '변화 관찰',
        check: '재점검 권장'
    };

    const sampleDevices = [
        { id: 'dn2100', name: 'CNC 선반', category: 'CNC 선반', model: 'DN Solutions Lynx 2100',
            point: '주축 하우징 전면', rpm: 1800, image: 'assets/equipment/dn2100-thumb.png', seeded: true },
        { id: 'kf5600', name: '머시닝센터', category: '수직 머시닝센터', model: '현대위아 KF5600 II',
            point: '주축 헤드 측면', rpm: 3600, image: 'assets/equipment/kf5600-thumb.png', seeded: true },
        { id: 'ys080', name: '산업용 로봇', category: '다관절 산업용 로봇', model: '현대로보틱스 YS080',
            point: '베이스 구동부 외함', rpm: 1200, image: 'assets/equipment/ys080-thumb.png', seeded: true },
        { id: 'as50', name: '에어 컴프레서', category: '에어 컴프레서', model: '경원기계 AS-50',
            point: '구동 모터 외함 측면', rpm: 1740, image: 'assets/equipment/as50-thumb.png', seeded: true }
    ];

    // These case profiles describe fabricated training signals, not equipment specifications.
    const profiles = {
        dn2100: {
            status: 'stable', phase: 1.6, main: 30,
            lines: [[30, -34, 0.5], [60, -48, 0.8], [90, -55, -0.5], [240, -57, 1.0], [430, -61, -0.4], [630, -65, 0.8]],
            summary: '회전 성분과 고주파 배경의 예시 패턴이 기준음과 유사합니다.',
            evidence: '선반 주축의 예시 1배 회전 성분',
            nextChecks: ['다음 점검도 같은 주축 속도와 공회전 조건에서 비교합니다.', '태그 위치에 맞춰 마이크 방향과 거리를 일정하게 유지합니다.']
        },
        kf5600: {
            status: 'attention', phase: 2.8, main: 120,
            lines: [[60, -35, 0.8], [120, -49, 7.3], [180, -55, 1.1], [240, -55, 4.1], [510, -61, -0.9], [720, -64, 1.2]],
            summary: '주축 회전의 두 배에 해당하는 예시 주파수 대역이 기준보다 커졌습니다.',
            evidence: '머시닝센터 주축의 예시 2배 회전 성분',
            nextChecks: ['공구 장착 상태, 공회전 여부와 주축 속도를 기준 등록 조건과 맞춥니다.', '같은 대역의 변화가 반복되는지 한 번 더 비교합니다.']
        },
        ys080: {
            status: 'attention', phase: 4.2, main: 40,
            lines: [[20, -37, 0.8], [40, -48, 6.4], [80, -55, -0.8], [160, -57, 0.5], [340, -59, 0.9], [510, -63, -1.1]],
            summary: '반복 동작의 예시 가동음에서 40 Hz 부근이 기준보다 커졌습니다. 같은 경로와 속도에서 다시 비교해 보세요.',
            evidence: '로봇 구동축의 예시 2배 회전 성분',
            nextChecks: ['같은 동작 경로, 속도와 부하에서 지정된 위치로 다시 비교합니다.', '같은 변화가 반복되면 정비 담당자와 구동부 점검 이력을 함께 확인합니다.']
        },
        as50: {
            status: 'check', phase: 5.4, main: 58,
            lines: [[29, -36, 0.9], [58, -50, 8.4], [116, -54, 7.2], [232, -58, 3.5], [405, -60, 0.7], [680, -65, -1.0]],
            summary: '두 회전 성분 대역에서 예시 가동음이 기준보다 함께 증가해 재비교가 필요합니다.',
            evidence: '컴프레서 구동 모터의 예시 2배 회전 성분',
            nextChecks: ['부하·무부하 운전 상태가 기준과 같은지 확인합니다.', '같은 상태의 재측정에서도 변화가 이어지면 담당자와 기록을 함께 확인합니다.']
        }
    };

    let sessionState = null;
    let sessionIssue = '';

    function rounded(value, digits = 1) {
        const scale = 10 ** digits;
        return Math.round(value * scale) / scale;
    }

    function uniqueId(prefix) {
        const random = global.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
        return prefix + '-' + Date.now().toString(36) + '-' + random;
    }

    function genericProfile(device) {
        const first = device.rpm ? device.rpm / 60 : 48;
        const phase = (device.category.length % 5) + 0.7;
        return {
            status: 'attention', phase, main: first * 2,
            lines: [[first, -36, 0.6], [first * 2, -52, 5.8], [first * 3, -57, 1.8],
                [first * 4, -62, 0.4], [first * 5, -64, -0.7]],
            summary: device.category + '의 예시 스펙트럼에서 일부 성분이 기준보다 커졌습니다. 운전 조건을 맞춘 뒤 다시 비교할 수 있습니다.',
            evidence: '예시 신호의 주요 비교 성분',
            nextChecks: ['같은 속도, 부하 및 측정 위치에서 비교 조건을 맞춥니다.', '주변 소음이 달라졌는지 확인하고 같은 변화가 반복되는지 살핍니다.']
        };
    }

    function signalLevel(hz, profile, measured) {
        const offset = measured ? 0.3 : 0;
        const floor = -79 + 1.7 * Math.sin(hz * 0.081 + profile.phase + offset) +
            1.2 * Math.cos(hz * 0.173 + profile.phase);
        let power = 10 ** (floor / 10);
        for (const [center, baseline, change] of profile.lines) {
            const width = Math.max(2, Math.min(22, center * 0.028));
            const level = baseline + (measured ? change : 0);
            power += 10 ** (level / 10) * Math.exp(-0.5 * ((hz - center) / width) ** 2);
        }
        return rounded(10 * Math.log10(power));
    }

    function compareAt(hz, profile) {
        const baseline = signalLevel(hz, profile, false);
        const measured = signalLevel(hz, profile, true);
        return { hz: rounded(hz, 2), baseline, measured };
    }

    function spectrum(profile) {
        const extent = Math.max(800, Math.ceil(Math.max(...profile.lines.map(([hz]) => hz)) * 1.12 / 100) * 100);
        const step = Math.max(8, Math.round(extent / 100));
        const frequencies = new Set([0, extent]);
        for (let hz = step; hz < extent; hz += step) frequencies.add(hz);
        for (const [hz] of profile.lines) frequencies.add(hz);
        return Array.from(frequencies).sort((a, b) => a - b).map(hz => compareAt(hz, profile));
    }

    function signed(value) {
        return (value > 0 ? '+' : '') + value.toFixed(1);
    }

    function createReport(device, createdAt = new Date().toISOString(), id = uniqueId('report')) {
        if (!device || typeof device.id !== 'string' || !device.name || !device.category || !device.point) {
            throw new Error('리포트를 만들 설비와 측정 위치를 선택해 주세요.');
        }
        const seed = sampleDevices.find(sample => sample.id === device.id);
        const matchesSample = seed && seed.category === device.category && seed.model === device.model &&
            seed.point === device.point && seed.rpm === device.rpm;
        const profile = matchesSample ? profiles[device.id] : genericProfile(device);
        const peaks = profile.lines.map(([hz]) => {
            const point = compareAt(hz, profile);
            return { ...point, change: rounded(point.measured - point.baseline) };
        });
        const main = peaks.find(point => point.hz === rounded(profile.main, 2));
        const second = [...peaks].filter(point => point !== main)
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
        const rpmLabel = matchesSample ? '예시 회전수' : '입력 회전수';
        const rpmContext = device.rpm
            ? `${rpmLabel} ${device.rpm.toLocaleString('ko-KR')} rpm · 1배 회전 주파수 ${rounded(device.rpm / 60, 2)} Hz`
            : '회전수 미등록 · 예시 주파수로 비교';

        return {
            id, deviceId: device.id, deviceName: device.name, category: device.category,
            model: device.model, point: device.point, rpm: device.rpm,
            createdAt, demo: true, status: profile.status, statusLabel: statusLabels[profile.status],
            summary: profile.summary,
            observations: [
                `${profile.evidence} ${main.hz} Hz에서 ${main.baseline.toFixed(1)} → ${main.measured.toFixed(1)} dBFS (${signed(main.change)} dB)로 표시됩니다.`,
                `${second.hz} Hz 예시 성분은 기준 대비 ${signed(second.change)} dB입니다.`
            ],
            nextChecks: [...profile.nextChecks], spectrum: spectrum(profile), peaks, rpmContext
        };
    }

    function initialState() {
        const now = Date.now();
        const reports = [
            createReport(sampleDevices[0], new Date(now - 2 * 3600000).toISOString(), 'sample-dn2100'),
            createReport(sampleDevices[1], new Date(now - 26 * 3600000).toISOString(), 'sample-kf5600'),
            createReport(sampleDevices[3], new Date(now - 51 * 3600000).toISOString(), 'sample-as50')
        ];
        return { nickname: defaultNickname, devices: structuredClone(sampleDevices), reports };
    }

    function persist(state) {
        const { nickname, devices, reports } = state;
        const data = { nickname, devices, reports };
        try {
            global.localStorage.setItem(storageKey, JSON.stringify(data));
            sessionState = null;
            return { ...data, storageIssue: '' };
        } catch {
            sessionState = data;
            sessionIssue = '브라우저에 저장할 수 없어 이 화면에서만 변경 사항을 유지합니다.';
            return { ...structuredClone(data), storageIssue: sessionIssue };
        }
    }

    function isDevice(device) {
        return device && ['id', 'name', 'category', 'model', 'point', 'image'].every(key => typeof device[key] === 'string');
    }

    function isReport(report) {
        return report?.demo === true && ['id', 'deviceId', 'deviceName', 'createdAt', 'status', 'statusLabel', 'summary', 'rpmContext']
            .every(key => typeof report[key] === 'string') && ['observations', 'nextChecks', 'spectrum', 'peaks']
            .every(key => Array.isArray(report[key]));
    }

    function load() {
        if (sessionState) {
            return { ...structuredClone(sessionState), storageIssue: sessionIssue };
        }
        try {
            const saved = global.localStorage.getItem(storageKey);
            if (!saved) return persist(initialState());
            const state = JSON.parse(saved);
            if (typeof state?.nickname !== 'string' || !Array.isArray(state.devices) || !state.devices.every(isDevice) ||
                !Array.isArray(state.reports) || !state.reports.every(isReport)) {
                throw new Error('Invalid demo data');
            }
            const devices = state.devices.map(device => {
                const sample = sampleDevices.find(item => item.id === device.id && item.model === device.model);
                return device.seeded && sample ? { ...device, image: sample.image } : device;
            });
            return { ...state, devices, storageIssue: '' };
        } catch {
            sessionState = initialState();
            sessionIssue = '저장된 데모 데이터를 읽지 못해 기본 예시를 표시합니다.';
            return { ...structuredClone(sessionState), storageIssue: sessionIssue };
        }
    }

    function text(value, label, max, required = true) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if ((required && !trimmed) || trimmed.length > max) {
            throw new Error(label + ' ' + (required ? '1~' : '최대 ') + max + '자로 입력해 주세요.');
        }
        return trimmed;
    }

    function setNickname(value) {
        const nickname = text(value, '별명', 20);
        return persist({ ...load(), nickname });
    }

    function saveDevice(input) {
        const state = load();
        const existing = input.id ? state.devices.find(device => device.id === input.id) : null;
        if (input.id && !existing) throw new Error('저장할 설비를 찾지 못했습니다.');
        const rpm = input.rpm == null || String(input.rpm).trim() === '' ? null : Number(input.rpm);
        if (rpm !== null && (!Number.isInteger(rpm) || rpm < 1 || rpm > 50000)) {
            throw new Error('회전수는 1~50,000 rpm 사이의 정수로 입력해 주세요.');
        }
        const name = text(input.name, '설비 이름', 60);
        const category = text(input.category, '설비 유형', 40);
        const model = text(input.model, '모델명', 80, false);
        const point = text(input.point, '측정 위치', 60);
        const sample = sampleDevices.find(item => item.id === existing?.id && item.model === model);
        const device = {
            id: existing?.id ?? uniqueId('device'), name, category, model, point, rpm,
            image: sample?.image ?? '', seeded: Boolean(existing?.seeded)
        };
        const devices = existing
            ? state.devices.map(current => current.id === device.id ? device : current)
            : [...state.devices, device];
        return persist({ ...state, devices });
    }

    function deleteDevice(id) {
        const state = load();
        return persist({ ...state, devices: state.devices.filter(device => device.id !== id) });
    }

    function recordReport(report) {
        if (!isReport(report)) {
            throw new Error('저장할 데모 리포트를 확인해 주세요.');
        }
        const state = load();
        const reports = [report, ...state.reports.filter(item => item.id !== report.id)]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return persist({ ...state, reports });
    }

    function deleteReport(id) {
        const state = load();
        return persist({ ...state, reports: state.reports.filter(report => report.id !== id) });
    }

    function demoRobot() {
        return structuredClone(sampleDevices.find(device => device.id === 'ys080'));
    }

    global.TenData = { load, setNickname, saveDevice, deleteDevice, createReport, recordReport, deleteReport, demoRobot };
})(globalThis);
