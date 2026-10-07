
// 请假申请页面脚本

// 提交请假申请
async function handleSubmit(formData) {
  if (!formData.applicantName || !formData.leaveType || !formData.startDate || !formData.endDate) {
    return { success: false, message: '请填写必填项' };
  }
  if (new Date(formData.endDate) < new Date(formData.startDate)) {
    return { success: false, message: '结束日期不能早于开始日期' };
  }
  formData.status = '待审批';
  return { success: true, data: formData };
}

// 重置表单
function handleReset() {
  return {
    applicantName: '',
    department: '',
    leaveType: '',
    startDate: '',
    endDate: '',
    duration: 0,
    reason: '',
    status: '待审批'
  };
}

// 自动计算请假天数
function calculateDuration(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}
