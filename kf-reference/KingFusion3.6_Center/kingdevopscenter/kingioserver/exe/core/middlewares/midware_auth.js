const tenantManager = require('../../lib/services/TenantManager');

// 获取用户和角色信息的中间件
const extractUserInfo = (req, res, next) => {
    if (req.originalUrl === '/importProjects') {
        return next();
    }
    const userId = req.headers['user_id'];
    const roleIds = req.headers['role_ids']?.split(',').map((item) => Number(item)) || [];
    if (!userId) {
        return res.sendErr(401, '缺少用户ID');
    }
    req.userInfo = {
        userId: Number(userId),
        roleIds: roleIds,
    };
    next();
};

// 检查用户是否有权限访问工程组
const checkProjectGroupAccess = async (req, res, next) => {
    try {
        const tenantId = req.headers.tenant_id;
        const { userId, roleIds } = req.userInfo;
        const groupId = req.body.guid || req.query.guid || req.body.groupId || req.query.groupId || req.body.projectGroupId || req.query.projectGroupId;
        if (!groupId) {
            return res.sendErr(401, '缺少工程组ID');
        }
        const projectGroupService = tenantManager.getProjectGroupService(tenantId);
        const group = await projectGroupService.getProjectGroupById(groupId);
        if (!group) {
            return res.sendErr(404, '工程组不存在');
        }
        // 默认工程组都可以访问
        if (group.guid === 'default_kingioserver') {
            return next();
        }
        // 检查用户是否是创建者
        if (userId == group.createBy) {
            return next();
        }
        // 检查角色是否有权访问工程组
        const hasAccess = roleIds.some((roleId) => group.roleIds.includes(parseInt(roleId)) || group.roleIds.includes(roleId + ''));
        if (!hasAccess) {
            return res.sendErr(403, '没有权限访问此工程组');
        }
        next();
    } catch (error) {
        res.sendErr(500, '权限检查失败');
    }
};
// 检查用户是否有权限访问工程
const checkProjectAccess = async (req, res, next) => {
    try {
        const tenantId = req.headers.tenant_id;
        const { userId, roleIds } = req.userInfo;
        const projectId = req.body.guid || req.query.guid || req.body.projectId || req.query.projectId;
        if (!projectId) {
            return res.sendErr(401, '缺少工程ID');
        }
        // 获取工程服务
        const projectService = tenantManager.getProjectService(tenantId);
        const project = await projectService.getProjectById(projectId);
        if (!project) {
            return res.sendErr(404, '工程不存在');
        }
        // 检查用户是否有权限访问该工程
        // 1.工程创建者
        // 2.工程共享的用户
        // 3.用户角色有权访问该工程组下所有工程
        let hasAccess = false;
        if (parseInt(project.createBy) === userId || project.shareUserIds.includes(userId)) {
            hasAccess = true;
        } else if (project.projectGroupId) {
            if (project.projectGroupId === 'default_kingioserver') {
                hasAccess = true;
            } else {
                // 检查通过工程组权限的工程权限
                const projectGroupService = tenantManager.getProjectGroupService(tenantId);
                const group = await projectGroupService.getProjectGroupById(project.projectGroupId);
                if (group) {
                    hasAccess = roleIds.some((roleId) => group.roleIds.includes(parseInt(roleId)) || group.roleIds.includes(roleId + ''));
                }
            }
        }
        if (!hasAccess) {
            return res.sendErr(403, '没有权限访问此工程');
        }
        next();
    } catch (error) {
        res.sendErr(500, '权限检查失败');
    }
};
// 检查工程编辑权限
const checkProjectWriteAccess = async (req, res, next) => {
    try {
        const tenantId = req.headers.tenant_id;
        const { userId } = req.userInfo;
        const projectId = req.body.guid || req.query.guid || req.query.projectId || req.body.projectId;
        if (!projectId) {
            return res.sendErr(401, '缺少工程ID');
        }
        // 获取工程服务
        const projectService = tenantManager.getProjectService(tenantId);
        const project = await projectService.getProjectById(projectId);
        if (!project) {
            return res.sendErr(404, '工程不存在');
        }
        // 检查用户是否有编辑工程权限
        // 1.工程创建者
        // 2.工程共享用户
        const canEdit = parseInt(project.createBy) === userId || project.shareUserIds.includes(userId);
        if (!canEdit) {
            return res.sendErr(403, '无权限编辑此工程');
        }
        next();
    } catch (error) {
        res.sendErr(500, '权限检查失败');
    }
};
// 检查工程编辑权限
const checkProjectArrWriteAccess = async (req, res, next) => {
    try {
        const tenantId = req.headers.tenant_id;
        const { userId } = req.userInfo;
        const guidArr = req.body.guidArr;
        for (let i = 0; i < guidArr.length; i++) {
            let projectId = guidArr[i];
            if (!projectId) {
                return res.sendErr(401, '缺少工程ID');
            }
            // 获取工程服务
            const projectService = tenantManager.getProjectService(tenantId);
            const project = await projectService.getProjectById(projectId);
            if (!project) {
                return res.sendErr(404, '工程不存在');
            }
            // 检查用户是否有编辑工程权限
            // 1.工程创建者
            // 2.工程共享用户
            const canEdit = parseInt(project.createBy) === userId || project.shareUserIds.includes(userId);
            if (!canEdit) {
                return res.sendErr(403, '无权限编辑此工程');
            }
        }
        next();
    } catch (error) {
        res.sendErr(500, '权限检查失败');
    }
};
// 检查工程所有者权限
const checkProjectAdminAccess = async (req, res, next) => {
    try {
        const tenantId = req.headers.tenant_id;
        const { userId } = req.userInfo;
        const projectId = req.body.guid || req.query.guid || req.query.projectId || req.body.projectId;
        if (!projectId) {
            return res.sendErr(401, '缺少工程ID');
        }
        // 获取工程服务
        const projectService = tenantManager.getProjectService(tenantId);
        const project = await projectService.getProjectById(projectId);
        if (!project) {
            return res.sendErr(404, '工程不存在');
        }
        // 检查用户是工程创建者
        const canEdit = parseInt(project.createBy) === userId;
        if (!canEdit) {
            return res.sendErr(403, '无权限编辑');
        }
        next();
    } catch (error) {
        res.sendErr(500, '权限检查失败');
    }
};
// 检查工程删除权限
const checkProjectDeleteAccess = async (req, res, next) => {
    try {
        const tenantId = req.headers.tenant_id;
        const { userId } = req.userInfo;
        const projectIds = req.body.guid || req.query.guid || req.query.projectId || req.body.projectId;
        if (!Array.isArray(projectIds) || projectIds.length === 0) {
            return res.sendErr(401, '工程ID数组参数有误');
        }
        for (let i = 0; i < projectIds.length; i++) {
            const projectId = projectIds[i];
            // 获取工程服务
            const projectService = tenantManager.getProjectService(tenantId);
            const project = await projectService.getProjectById(projectId);
            if (!project) {
                return res.sendErr(404, `工程不存在`);
            }
            // 检查用户是工程创建者
            const canEdit = project.createBy === userId;
            if (!canEdit) {
                return res.sendErr(403, `无权限编辑工程${projectId}`);
            }
        }
        next();
    } catch (error) {
        res.sendErr(500, '权限检查失败');
    }
};
module.exports = {
    extractUserInfo,
    checkProjectGroupAccess,
    checkProjectAccess,
    checkProjectWriteAccess,
    checkProjectAdminAccess,
    checkProjectDeleteAccess,
    checkProjectArrWriteAccess,
};
