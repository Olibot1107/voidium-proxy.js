function findTargetByName(targets, name) {
    return targets.find(t => t.name === name) || null;
}

module.exports = {
    findTargetByName
};
