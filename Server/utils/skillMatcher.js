const calculateSkillMatch = (userSkills = [], jobSkills = []) => {

    if (!userSkills.length || !jobSkills.length) {
        return 0;
    }

    const normalizedUserSkills = userSkills.map(skill =>
        skill.trim().toLowerCase()
    );

    const normalizedJobSkills = jobSkills.map(skill =>
        skill.trim().toLowerCase()
    );

    const matchingSkills = normalizedJobSkills.filter(skill =>
        normalizedUserSkills.includes(skill)
    );

    const matchPercentage = Math.round(
        (matchingSkills.length / normalizedJobSkills.length) * 100
    );

    return matchPercentage;
};


module.exports = calculateSkillMatch;