#!/bin/bash

node << EOF
const colors = require('colors');
console.log(colors.rainbow(
  '    ====================\n' +
  '    !!! Tests passed !!!\n' +
  '    ===================='
));
EOF

