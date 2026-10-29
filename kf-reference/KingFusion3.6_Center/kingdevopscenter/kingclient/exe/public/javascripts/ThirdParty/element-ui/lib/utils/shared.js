"use strict";exports.__esModule=!0,exports.isDef=isDef,exports.isKorean=isKorean;function isDef(e){return e!=null}function isKorean(e){var r=/([(\uAC00-\uD7AF)|(\u3130-\u318F)])+/gi;return r.test(e)}
