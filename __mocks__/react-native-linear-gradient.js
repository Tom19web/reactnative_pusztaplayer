import React from 'react';
import { View } from 'react-native';

const LinearGradient = ({ children, ...rest }) => <View {...rest}>{children}</View>;
export default LinearGradient;
