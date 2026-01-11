using Kanban.Models;
using Kanban.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    public class KanbanController : Controller
    {
        private readonly IKanbanService _kanbanService;
        public KanbanController(IKanbanService kanbanService)
        {
            _kanbanService = kanbanService;
        }
        public IActionResult Index()
        {
            return View();
        }
        [Authorize]
        public async Task<IActionResult> GetBoards()
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoards(userId);
            if (!r.Success)
            {
                return Ok(ServiceResult.Fail(r.ErrorMessage));
            }
            return Ok(ServiceResult<List<BoardResultModel>>.Ok(r.Data.Select(x => new BoardResultModel { IsOwner = x.UserId == userId }).ToList()));
        }
        //[Authorize]
        //public async Task<IActionResult> CreateBoard([FromBody] BoardInputModel model)
        //{
        //    var userId = User.GetUserId();
        //    var r = await _kanbanService.GetBoards(userId);
        //    if (!r.Success)
        //    {
        //        return Ok(ServiceResult.Fail(r.ErrorMessage));
        //    }
        //    return Ok(ServiceResult<List<BoardResultModel>>.Ok(r.Data.Select(x => new BoardResultModel { IsOwner = x.UserId == userId }).ToList()));
        //}
    }
}
