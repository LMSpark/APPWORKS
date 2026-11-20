function __init__() {
  const ordersView = $dataSet?.getView('Orders', 'default')
  if (!ordersView) return

  ordersView._modelPerm = {
    allowCreate: true,
  }
}
