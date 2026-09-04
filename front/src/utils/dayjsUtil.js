import dayjs from 'dayjs';
import { t } from '@/i18n/index.js';

export const formatTime = (input) => {
  return dayjs(input).format('YYYY-MM-DD HH:mm:ss');
};
export const getStartAndEndTime = () => {
  const startDate = formatTime(new Date().setHours(0, 0, 0, 0));
  const endDate = formatTime(new Date().setHours(23, 59, 59, 999));
  return [startDate, endDate];
};
export const formatRunTime = (aliveTime) => {
  if (!aliveTime) {
    return '';
  }
  let seconds = aliveTime;
  const days = Math.floor(seconds / (24 * 3600));
  seconds %= 24 * 3600;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return { days, hours, minutes, seconds };
};

export function currentDateTime() {
  const date = new Date();

  return [new Date(date.setHours('0', '0', '0')), new Date(date.setHours('23', '59', '59'))];
}
