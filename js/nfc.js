(function (global) {
    'use strict';

    function normalizePoint(value) {
        if (typeof value !== 'string') return null;
        const point = value.trim();
        return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(point) ? point.toLowerCase() : null;
    }

    function pointFromUrl(href, origin) {
        if (typeof href !== 'string') return null;
        try {
            const url = new URL(href);
            if ((url.protocol !== 'https:' && url.protocol !== 'http:') ||
                url.username || url.password || (origin && origin !== url.origin)) return null;

            const points = url.searchParams.getAll('point');
            const pointId = points.length === 1 ? normalizePoint(points[0]) : null;
            return pointId ? { pointId, url: url.href } : null;
        } catch {
            return null;
        }
    }

    function readPointFromUrl(href) {
        return pointFromUrl(href)?.pointId ?? null;
    }

    function pointFromRecord(record, origin) {
        try {
            if (record.recordType === 'url' || record.recordType === 'absolute-url') {
                if (!origin) return null;
                return pointFromUrl(new TextDecoder('utf-8', { fatal: true }).decode(record.data), origin);
            }
            if (record.recordType === 'text') {
                const text = new TextDecoder(record.encoding || 'utf-8', { fatal: true }).decode(record.data);
                const pointId = normalizePoint(text);
                return pointId ? { pointId, url: null } : null;
            }
        } catch {
            return null;
        }
        return null;
    }

    function nfcError(error, action) {
        switch (error?.name) {
            case 'AbortError':
                return error;
            case 'NotAllowedError':
                return new Error('브라우저에서 NFC 권한을 허용한 뒤 다시 시도하세요.');
            case 'NotSupportedError':
                return new Error('이 기기에서 NFC 태그 ' + action + '를 사용할 수 없습니다.');
            case 'NotReadableError':
                return new Error('휴대폰의 NFC가 켜져 있는지 확인한 뒤 다시 시도하세요.');
            case 'SecurityError':
                return new Error('HTTPS로 열린 앱에서 버튼을 눌러 NFC ' + action + '를 시작하세요.');
            default:
                return new Error('NFC ' + action + '를 완료하지 못했습니다. 다시 시도하세요.');
        }
    }

    function isSupported() {
        return Boolean(global.isSecureContext && global.top === global && typeof global.NDEFReader === 'function');
    }

    function createReader(action) {
        if (!global.isSecureContext) throw new Error('NFC 태그를 사용하려면 HTTPS로 앱을 열어 주세요.');
        if (global.top !== global) throw new Error('새 브라우저 탭에서 앱을 직접 열어 NFC를 사용하세요.');
        if (typeof global.NDEFReader !== 'function') {
            throw new Error('이 브라우저에서는 앱 안에서 NFC ' + action + '를 사용할 수 없습니다.');
        }
        return new global.NDEFReader();
    }

    async function scan({ signal, origin = global.location?.origin, onWaiting } = {}) {
        const abortError = new DOMException('NFC 읽기를 취소했습니다.', 'AbortError');
        if (signal?.aborted) throw abortError;
        const reader = createReader('읽기');
        const controller = new AbortController();
        return new Promise((resolve, reject) => {
            function finish(callback, value) {
                if (controller.signal.aborted) return;
                signal?.removeEventListener('abort', cancel);
                reader.removeEventListener('reading', read);
                reader.removeEventListener('readingerror', unreadable);
                controller.abort();
                callback(value);
            }

            function cancel() {
                finish(reject, abortError);
            }

            function read(event) {
                const points = (event.message?.records ?? [])
                    .map(record => pointFromRecord(record, origin)).filter(Boolean);
                const pointIds = new Set(points.map(point => point.pointId));
                const urls = new Set(points.filter(point => point.url).map(point => point.url));
                if (pointIds.size !== 1 || urls.size > 1) {
                    finish(reject, new Error('태그에서 측정 위치를 확인할 수 없습니다. 10초만용 NFC 스티커를 사용해 주세요.'));
                    return;
                }
                finish(resolve, points.find(point => point.url) || points[0]);
            }

            function unreadable() {
                finish(reject, new Error('태그를 읽을 수 없습니다. 휴대폰의 NFC 인식 부분을 스티커에 다시 가까이 대 주세요.'));
            }

            signal?.addEventListener('abort', cancel, { once: true });
            reader.addEventListener('reading', read);
            reader.addEventListener('readingerror', unreadable);
            try {
                reader.scan({ signal: controller.signal }).then(() => {
                    if (!controller.signal.aborted) onWaiting?.();
                }).catch(error => finish(reject, nfcError(error, '읽기')));
            } catch (error) {
                finish(reject, nfcError(error, '읽기'));
            }
        });
    }

    async function write({ url, signal } = {}) {
        if (signal?.aborted) throw new DOMException('NFC 쓰기를 취소했습니다.', 'AbortError');
        const reader = createReader('쓰기');
        const origin = global.location?.origin;
        const point = origin && pointFromUrl(url, origin);
        if (!point) throw new Error('이 앱의 측정 위치 링크를 확인하세요.');

        try {
            await reader.write({ records: [{ recordType: 'url', data: point.url }] }, { signal });
        } catch (error) {
            throw nfcError(error, '쓰기');
        }
    }

    global.EquipmentNFC = { isSupported, readPointFromUrl, scan, write };
})(globalThis);
