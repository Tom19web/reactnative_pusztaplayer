export function getConfig(): Record<string, any> {
  try {
    const c = require('react-native-config');
    return (c.default || c.Config || c) as Record<string, any>;
  } catch {
    return {};
  }
}
