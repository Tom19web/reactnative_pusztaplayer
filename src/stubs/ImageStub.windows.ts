// Stub for Image component on Windows.
// Prevents RCTImageView registration failure in Fabric mode.
import React from 'react';

const Image = React.forwardRef((props: any, ref: any) => {
  const { source, style, ...rest } = props;
  // Return a simple View placeholder (images not supported on RNW Fabric)
  return React.createElement('RCTView', { ...rest, ref, style: [style, { backgroundColor: '#1a1a1a' }] });
});
Image.displayName = 'Image';

export default Image;
