export function getLocalStorage(key, defaultValue) {
  const value = localStorage.getItem(key);
  if (value === null) {
    return defaultValue;
  }
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

export function setLocalStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
