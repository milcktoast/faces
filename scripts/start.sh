PATH=$(npm bin):$PATH
rm build/bundle-app.js
budo src/index.js:build/bundle-app.js --live -- -t installify -t glslify
