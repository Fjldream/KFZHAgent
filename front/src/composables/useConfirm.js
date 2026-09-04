import { useLangStore } from '@/stores/langStore.js';

const { i18nReactive } = useLangStore();

export function useConfirm(
  message = i18nReactive('确认执行此操作?'),
  title = i18nReactive('操作确认'),
  type = 'warning',
) {
  return ElMessageBox.confirm(message, title, {
    confirmButtonText: i18nReactive('confirm'),
    cancelButtonText: i18nReactive('cancel'),
    type,
  });
}
