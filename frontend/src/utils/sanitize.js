import DOMPurify from 'dompurify';
export const sanitizeHtml = (value) => {
    return DOMPurify.sanitize(value, { USE_PROFILES: { html: true } });
};
