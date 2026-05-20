// BackHandler stub for Windows - prevents BackHandler.addEventListener crash
const BackHandler = {
  exitApp: () => {},
  addEventListener: (_eventName: string, _handler: () => any) => {
    return { remove: () => {} };
  },
  removeEventListener: (_eventName: string, _handler: () => any) => {},
};
export default BackHandler;
