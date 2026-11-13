(() => {
    'use strict';

    // The comparison reference and process outcomes describe one illustrative report.
    // Only the recorded band level is computed from WeldingSignal.
    const maxScore = 100;
    const deductions = Object.freeze({ gas: 10, spatter: 7, humping: 5 });
    const gas = Object.freeze({
        band: Object.freeze([1800, 2600]), referenceDbFS: -61, referenceFlow: 15, estimatedFlow: 37
    });
    const spatter = Object.freeze({ band: Object.freeze([5000, 8000]), referenceCount: 3, estimatedCount: 8 });
    const conditions = Object.freeze([
        { key: 'current', label: '용접 전류', value: 150, unit: 'A', status: '적정', tone: 'good' },
        { key: 'voltage', label: '아크 전압', value: 18.5, unit: 'V', status: '적정', tone: 'good' },
        { key: 'wireFeedSpeed', label: '와이어 송급 속도 (WFS)', value: 5, unit: 'm/min', status: '적정', tone: 'good' },
        { key: 'ctwd', label: '팁과 소재 사이 거리 (CTWD)', value: 15, unit: 'mm', status: '적정', tone: 'good' },
        { key: 'travelSpeed', label: '용접 이동 속도', value: 12, unit: 'mm/s', status: '조금 빠름', tone: 'caution' },
        { key: 'gasFlow', label: '보호가스 유량', value: gas.estimatedFlow, unit: 'L/min', status: '너무 많음', tone: 'high' }
    ].map(Object.freeze));

    function gasPeak(signal) {
        return signal.spectrum.reduce((peak, point) => {
            const insideBand = point.frequencyHz >= gas.band[0] && point.frequencyHz < gas.band[1];
            return insideBand && (!peak || point.dbFS > peak.dbFS) ? point : peak;
        }, null);
    }

    function gasChangeDb(signal) {
        return Math.round((gasPeak(signal).dbFS - gas.referenceDbFS) * 10) / 10;
    }

    globalThis.WeldingCase = Object.freeze({
        score: maxScore - Object.values(deductions).reduce((total, value) => total + value, 0),
        maxScore, scoreLabel: '종합 점수', gas, spatter, conditions,
        humping: Object.freeze({ deduction: deductions.humping }), deductions, gasPeak, gasChangeDb
    });
})();
