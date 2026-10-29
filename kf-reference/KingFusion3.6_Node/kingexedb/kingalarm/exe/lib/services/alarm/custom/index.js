const { loadAlarmList } = require('./loader'),
    { addDepsToItems } = require('./depIndex'),
    { CustomAlarmScheduler } = require('./scheduler');
class CustomAlarmManager {
    constructor() {
        ((this.scheduler = null), (this.enqueueAlarm = null), (this.getAlarmSnapshot = null), (this.trace = null));
    }
    async init(r, e) {
        try {
            ((this.scheduler = null),
                (this.enqueueAlarm = null),
                (this.getAlarmSnapshot = null),
                (this.trace = null),
                (this.enqueueAlarm = e.enqueue),
                (this.getAlarmSnapshot = e.getAlarmSnapshot),
                (this.trace =
                    e.trace ||
                    ((a, ...n) => {
                        console.log('info', `[CustomAlarm:${a}]`, ...n);
                    })));
            const t = loadAlarmList(r);
            if (t.length === 0) {
                console.log('\u672A\u627E\u5230\u81EA\u5B9A\u4E49\u62A5\u8B66\u914D\u7F6E');
                return;
            }
            const l = addDepsToItems(t);
            ((this.scheduler = new CustomAlarmScheduler({ enqueueAlarm: this.enqueueAlarm, getAlarmSnapshot: this.getAlarmSnapshot, trace: this.trace, alarmUpgradeConfig: e.alarmUpgradeConfig })),
                this.scheduler.init(l),
                console.log(`\u81EA\u5B9A\u4E49\u62A5\u8B66\u521D\u59CB\u5316\u5B8C\u6210\uFF0C\u52A0\u8F7D\u4E86 ${l.length} \u4E2A\u62A5\u8B66\u9879`));
                if(e.recoverId){
                    const snapshot = e.getAlarmSnapshot()
                    const now = Date.now()
                    this.scheduler.scheduleRun(e.recoverId, snapshot, now);
                }
        } catch (t) {
            console.error('\u81EA\u5B9A\u4E49\u62A5\u8B66\u521D\u59CB\u5316\u5931\u8D25:', t.message);
        }
    }
    onTagChange(r, e, t, l) {
        this.scheduler && this.scheduler.onTagChange(r, e, t, l);
    }
    destroy() {
        this.scheduler && (this.scheduler.destroy(), (this.scheduler = null));
    }
}
const customAlarmManager = new CustomAlarmManager();
module.exports = { init: (s, r) => customAlarmManager.init(s, r), onTagChange: (s, r, e, t) => customAlarmManager.onTagChange(s, r, e, t), destroy: () => customAlarmManager.destroy() };
