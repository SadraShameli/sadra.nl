module.exports = {
    '*.css': 'npm run stylelint:fix',
    '*.js': 'npm run eslint:fix',
    'package.json': 'bunx sort-package-json',
};
